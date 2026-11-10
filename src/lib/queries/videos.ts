import 'server-only'
import { and, eq, gt, inArray, isNull, lt, lte, sql } from 'drizzle-orm'
import type { Tx } from '@/lib/db'
import { withTenant } from '@/lib/db/tenant'
import { tenantPlans } from '@/lib/db/schema'
import { shopThemePublishes, shopThemeRevisions, videos } from '@/lib/db/schema-themes'
import { productVideos } from '@/lib/db/schema-catalogue'
import { enqueue } from '@/lib/outbox'
import { isLive, MAX_LIVE, notReadyAfterMs, videoState, type VideoRow, type VideoState, type VideoUse } from '@/domains/video/state'

// =============================================================================
// FILE: src/lib/queries/videos.ts — a shop's videos (V1, docs/plans/2026-11-09-video-v1.md; access drizzle/0081).
// Every function takes the caller's withTenant transaction: the row policy keeps it to the shop. Mux is never called
// here: a pending row is committed before the upload is asked for (ADR-0008), and deletes and cancels are outbox rows
// in the same transaction as the change (ADR-0006).
// =============================================================================

/** Uploads a shop may START, in every state (removed and failed count: each one may have cost Frrata). Loops (V1). */
export const PER_DAY = 10, PER_DAY_TRIAL = 3, PER_MONTH = 30
/**
 * Product videos (PV·1; unit-economics and security reviews 2026-11-10): counted over their own rows only, so neither
 * use eats the other's. A failed upload (too long, too short, too small) may still have cost a month of storage, so
 * three in a day stop the shop's uploads until tomorrow.
 */
export const PRODUCT_CAPS = { perDay: 20, perDayTrial: 5, perMonth: 100, perMonthTrial: 20, perHour: 5, failsPerDay: 3, live: 200 } as const

const ROW = {
  id: videos.id, uploadId: videos.uploadId, assetId: videos.assetId, playbackId: videos.playbackId, muxEnv: videos.muxEnv,
  durationMs: videos.durationMs, width: videos.width, height: videos.height, createdAt: videos.createdAt, readyAt: videos.readyAt,
  mp4ReadyAt: videos.mp4ReadyAt, erroredAt: videos.erroredAt, error: videos.error, removedAt: videos.removedAt, use: videos.use,
}
export type Video = Omit<VideoRow, 'use'> & { id: string; assetId: string | null; muxEnv: string; durationMs: number | null; width: number | null; height: number | null; use: VideoUse }
const asVideo = <T extends { use: string }>(r: T) => ({ ...r, use: (r.use === 'product' ? 'product' : 'loop') as VideoUse })

export async function videoOf(tx: Tx, tenantId: string, id: string): Promise<Video | null> {
  const [v] = await tx.select(ROW).from(videos).where(and(eq(videos.tenantId, tenantId), eq(videos.id, id)))
  return v ? asVideo(v) : null
}

/**
 * A pending row, under the shop's caps, read and written under a per-shop lock so two starts can't race past them
 * (security review finding 1). The caller commits it, then asks Mux for the upload.
 */
export async function startVideo(tx: Tx, tenantId: string, memberId: string, muxEnv: string, now: Date, use: VideoUse = 'loop'): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('videos:' || ${tenantId}))`)
  const dayAgo = new Date(now.getTime() - 86_400_000), monthAgo = new Date(now.getTime() - 30 * 86_400_000)
  const recent = (await tx.select(ROW).from(videos).where(and(eq(videos.tenantId, tenantId), gt(videos.createdAt, monthAgo), eq(videos.use, use)))).map(asVideo)
  const [plan] = await tx.select({ trialEndsAt: tenantPlans.trialEndsAt }).from(tenantPlans)
    .where(and(eq(tenantPlans.tenantId, tenantId), lte(tenantPlans.startsAt, now))).orderBy(sql`${tenantPlans.startsAt} desc`).limit(1)
  const onTrial = !!plan?.trialEndsAt && plan.trialEndsAt > now
  if (use === 'product') return startProduct(tx, tenantId, memberId, muxEnv, now, recent, onTrial)
  const today = recent.filter((v) => v.createdAt > dayAgo).length
  if (today >= (onTrial ? PER_DAY_TRIAL : PER_DAY)) return { ok: false, error: onTrial ? 'Three videos a day on a trial. Try again tomorrow.' : 'Ten videos a day. Try again tomorrow.' }
  if (recent.length >= PER_MONTH) return { ok: false, error: 'Thirty videos a month. Remove one you don’t use, or try again next month.' }
  const live = (await tx.select(ROW).from(videos).where(and(eq(videos.tenantId, tenantId), isNull(videos.removedAt), eq(videos.use, 'loop')))).map(asVideo)
  if (live.filter((v) => isLive(v, now)).length >= MAX_LIVE) return { ok: false, error: 'Your shop holds 20 videos. Remove one first.' }
  // Only these three columns: the app may insert nothing else (drizzle/0081, tenancy audit H1), and drizzle's insert
  // would name every column (as DEFAULT), which Postgres checks too.
  const [r] = await tx.execute<{ id: string }>(sql`insert into videos (tenant_id, mux_env, created_by) values (${tenantId}, ${muxEnv}, ${memberId}) returning id`) as unknown as { id: string }[]
  return { ok: true, id: r!.id }
}

/** startVideo for a product's video: its own caps, then the row (use = 'product'). The caller links it to the product
 *  in the same transaction. A net first: product videos nothing links, past their window, are released. */
async function startProduct(tx: Tx, tenantId: string, memberId: string, muxEnv: string, now: Date, recent: Video[], onTrial: boolean): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await releaseProductVideos(tx, tenantId, now)
  const C = PRODUCT_CAPS, dayAgo = now.getTime() - 86_400_000, hourAgo = now.getTime() - 3_600_000
  const today = recent.filter((v) => v.createdAt.getTime() > dayAgo)
  if (today.filter((v) => v.error === 'too_long' || v.error === 'too_short' || v.error === 'too_small').length >= C.failsPerDay) return { ok: false, error: 'Three videos didn’t fit today. Check the length (6 seconds to a minute) and try again tomorrow.' }
  if (recent.filter((v) => v.createdAt.getTime() > hourAgo).length >= C.perHour) return { ok: false, error: 'Five videos in the last hour. Try again shortly.' }
  if (today.length >= (onTrial ? C.perDayTrial : C.perDay)) return { ok: false, error: onTrial ? 'Five videos a day on a trial. Try again tomorrow.' : 'Twenty videos a day. Try again tomorrow.' }
  if (recent.length >= (onTrial ? C.perMonthTrial : C.perMonth)) return { ok: false, error: onTrial ? 'Twenty videos a month on a trial.' : 'A hundred videos a month. Try again next month.' }
  const live = (await tx.select(ROW).from(videos).where(and(eq(videos.tenantId, tenantId), isNull(videos.removedAt), eq(videos.use, 'product')))).map(asVideo)
  if (live.filter((v) => isLive(v, now)).length >= C.live) return { ok: false, error: 'Your shop holds 200 product videos. Remove one first.' }
  const [r] = await tx.execute<{ id: string }>(sql`insert into videos (tenant_id, mux_env, created_by, use) values (${tenantId}, ${muxEnv}, ${memberId}, 'product') returning id`) as unknown as { id: string }[]
  return { ok: true, id: r!.id }
}

/** A product's video: its link and the video row (product videos only). */
export async function productVideoFor(tx: Tx, tenantId: string, productId: string): Promise<(Video & { posterMs: number; button: string }) | null> {
  const [r] = await tx.select({ ...ROW, posterMs: productVideos.posterMs, button: productVideos.button }).from(productVideos)
    .innerJoin(videos, and(eq(videos.tenantId, productVideos.tenantId), eq(videos.id, productVideos.videoId)))
    .where(and(eq(productVideos.tenantId, tenantId), eq(productVideos.productId, productId), eq(videos.use, 'product'))).limit(1)
  return r ? asVideo(r) : null
}

/** Link a new product video (the start's own row) to its product. */
export async function linkProductVideo(tx: Tx, tenantId: string, productId: string, videoId: string) {
  await tx.insert(productVideos).values({ tenantId, productId, videoId })
}

/** Let a product's video go: the link goes, the row is removed and its Mux side queued (removeVideo). */
export async function unlinkProductVideo(tx: Tx, tenantId: string, productId: string, now: Date): Promise<boolean> {
  const v = await productVideoFor(tx, tenantId, productId)
  if (!v) return false
  await tx.delete(productVideos).where(and(eq(productVideos.tenantId, tenantId), eq(productVideos.productId, productId)))
  await removeVideo(tx, tenantId, v, now)
  return true
}

/**
 * The net for product videos (architecture and security reviews 2026-11-10): rows nothing links (a crash between the
 * row and its link, a product removed outside the app), and linked rows that failed, once past their upload window
 * plus an hour, are released: unlinked, removed, their Mux side queued.
 */
export async function releaseProductVideos(tx: Tx, tenantId: string, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - notReadyAfterMs('product') - 3_600_000)
  const rows = (await tx.select({ ...ROW, productId: productVideos.productId }).from(videos)
    .leftJoin(productVideos, and(eq(productVideos.tenantId, videos.tenantId), eq(productVideos.videoId, videos.id)))
    .where(and(eq(videos.tenantId, tenantId), eq(videos.use, 'product'), isNull(videos.removedAt), lt(videos.createdAt, cutoff)))).map(asVideo)
  let n = 0
  for (const v of rows) {
    if (v.productId && videoState(v, now).kind !== 'failed') continue
    if (v.productId) await tx.delete(productVideos).where(and(eq(productVideos.tenantId, tenantId), eq(productVideos.videoId, v.id)))
    await removeVideo(tx, tenantId, v, now); n++
  }
  return n
}

/** Mux answered with the upload: the row now knows it (the webhook definer routes by it). */
export async function setUpload(tx: Tx, tenantId: string, id: string, uploadId: string) {
  await tx.update(videos).set({ uploadId }).where(and(eq(videos.tenantId, tenantId), eq(videos.id, id), isNull(videos.uploadId)))
}

/** The upload couldn't be made, or Mux said the asset failed: "Didn't work". */
export async function failVideo(tx: Tx, tenantId: string, id: string, error: string, now: Date) {
  await tx.update(videos).set({ erroredAt: now, error: error.slice(0, 40) }).where(and(eq(videos.tenantId, tenantId), eq(videos.id, id), isNull(videos.erroredAt)))
}

/** Queue the Mux asset's deletion (the sender confirms with Mux that it is this row's before deleting). */
export const queueAssetDelete = (tx: Tx, tenantId: string, videoId: string) =>
  enqueue(tx, { tenantId, kind: 'mux.asset.delete', dedupeKey: `mux.asset.delete:${videoId}`, payload: { videoId } })

/**
 * Removed for good: the row says so and the Mux side is queued in the same transaction (an asset is deleted, an upload
 * still open is closed). Used by Cancel, and at publish or discard for videos nothing references any more.
 */
export async function removeVideo(tx: Tx, tenantId: string, v: Pick<Video, 'id' | 'uploadId' | 'assetId' | 'removedAt'>, now: Date) {
  if (!v.removedAt) await tx.update(videos).set({ removedAt: now }).where(and(eq(videos.tenantId, tenantId), eq(videos.id, v.id), isNull(videos.removedAt)))
  if (v.assetId) await queueAssetDelete(tx, tenantId, v.id)
  else if (v.uploadId) await enqueue(tx, { tenantId, kind: 'mux.upload.cancel', dedupeKey: `mux.upload.cancel:${v.id}`, payload: { videoId: v.id } })
}

/** Publishes an Undo can still reach: their looks keep their videos (beyond them, history shows the photo). */
const KEEP_PUBLISHES = 5

/** The videos the shop's open draft or its recent publishes reference (speed review: never every revision ever). */
async function referenced(tx: Tx, tenantId: string): Promise<Set<string>> {
  const rows = await tx.execute<{ id: string }>(sql`
    select distinct s->'video'->>'id' as id
    from ${shopThemeRevisions} r, jsonb_array_elements(coalesce(r.settings->'home', '[]'::jsonb)) s
    where r.tenant_id = ${tenantId} and jsonb_typeof(s->'video') = 'object'
      and (r.id in (select p.revision_id from ${shopThemePublishes} p where p.tenant_id = ${tenantId} order by p.published_at desc limit ${KEEP_PUBLISHES})
           or not exists (select 1 from ${shopThemePublishes} p where p.tenant_id = ${tenantId} and p.revision_id = r.id))`)
  return new Set((rows as unknown as { id: string }[]).map((r) => r.id).filter(Boolean))
}

/** Young rows may be mid-upload, not yet saved into the draft: they are left alone until the upload window is long shut. */
const SETTLED_MS = 2 * 60 * 60_000

/**
 * At publish and at discard: every video neither the draft nor a recent publish references, and older than an upload
 * could still be, is removed and its Mux side queued. Draft edits (Replace, Remove) only detach; nothing is deleted
 * while Undo can come back to it (architecture review 2026-11-09, finding 5).
 */
export async function releaseUnusedVideos(tx: Tx, tenantId: string, now: Date): Promise<number> {
  const used = await referenced(tx, tenantId)
  const cutoff = new Date(now.getTime() - SETTLED_MS)
  // Loops only (PV·1): a product's video is never the Look's to release (releaseProductVideos is its net).
  const rows = await tx.select(ROW).from(videos).where(and(eq(videos.tenantId, tenantId), isNull(videos.removedAt), lt(videos.createdAt, cutoff), eq(videos.use, 'loop')))
  const gone = rows.filter((v) => !used.has(v.id))
  for (const v of gone) await removeVideo(tx, tenantId, v, now)
  return gone.length
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The save check (architecture review minor): a video id in a saved look must be one of this shop's own rows, not
 * removed. Anything else is dropped from the section (the photo shows). Ids that aren't uuids never reach the query.
 */
export async function cleanVideos<L extends { home?: unknown[] }>(tx: Tx, tenantId: string, layer: L): Promise<L> {
  const idOf = (s: unknown) => { const id = (s as { video?: { id?: unknown } } | null)?.video?.id; return typeof id === 'string' && UUID.test(id) ? id : null }
  const ids = (layer.home ?? []).flatMap((s) => { const id = idOf(s); return id ? [id] : [] })
  const ok = ids.length ? new Set((await tx.select({ id: videos.id }).from(videos).where(and(eq(videos.tenantId, tenantId), inArray(videos.id, ids), isNull(videos.removedAt), eq(videos.use, 'loop')))).map((r) => r.id)) : new Set<string>()
  const home = (layer.home ?? []).map((s) => {
    if ((s as { video?: unknown } | null)?.video === undefined) return s
    const id = idOf(s)
    if (id && ok.has(id)) return s
    const { video: _drop, ...rest } = s as Record<string, unknown>
    return rest
  })
  return layer.home ? { ...layer, home } : layer
}

/** The console's field: one video's state, derived. */
export async function videoStatus(tx: Tx, tenantId: string, id: string, now: Date): Promise<(VideoState & { durationMs: number | null; width: number | null; height: number | null }) | null> {
  const v = await videoOf(tx, tenantId, id)
  return v ? { ...videoState(v, now), durationMs: v.durationMs, width: v.width, height: v.height } : null
}

/** The status read the console polls while a video is getting ready (its own short transaction). */
export const videoStatusFor = (tenantId: string, id: string, now: Date) => withTenant(tenantId, (tx) => videoStatus(tx, tenantId, id, now))

/** For the shop: the playable videos among these ids (the live look's), id → playback id and size. */
export async function playableVideos(tx: Tx, tenantId: string, ids: string[], now: Date): Promise<Record<string, { playbackId: string; width: number | null; height: number | null }>> {
  const valid = ids.filter((i) => UUID.test(i)).slice(0, 40)
  if (!valid.length) return {}
  const rows = (await tx.select(ROW).from(videos).where(and(eq(videos.tenantId, tenantId), inArray(videos.id, valid), isNull(videos.removedAt), eq(videos.use, 'loop')))).map(asVideo)
  const out: Record<string, { playbackId: string; width: number | null; height: number | null }> = {}
  for (const v of rows) { const s = videoState(v, now); if (s.kind === 'playable') out[v.id] = { playbackId: s.playbackId, width: v.width, height: v.height } }
  return out
}

/** The shop's read (cached in storefront.ts shopVideos) and the preview's (uncached): ids are the look's, comma-joined. */
export const playableVideosFor = (tenantId: string, key: string) => withTenant(tenantId, (tx) => playableVideos(tx, tenantId, key ? key.split(',') : [], new Date()))
export const previewVideos = playableVideosFor
