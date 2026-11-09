import 'server-only'
import { and, eq, gt, inArray, isNull, lt, lte, sql } from 'drizzle-orm'
import type { Tx } from '@/lib/db'
import { withTenant } from '@/lib/db/tenant'
import { tenantPlans } from '@/lib/db/schema'
import { shopThemeRevisions, videos } from '@/lib/db/schema-themes'
import { enqueue } from '@/lib/outbox'
import { isLive, MAX_LIVE, videoState, type VideoRow, type VideoState } from '@/domains/video/state'

// =============================================================================
// FILE: src/lib/queries/videos.ts — a shop's videos (V1, docs/plans/2026-11-09-video-v1.md; access drizzle/0081).
// Every function takes the caller's withTenant transaction: the row policy keeps it to the shop. Mux is never called
// here: a pending row is committed before the upload is asked for (ADR-0008), and deletes and cancels are outbox rows
// in the same transaction as the change (ADR-0006).
// =============================================================================

/** Uploads a shop may START, in every state (removed and failed count: each one may have cost Frrata). */
export const PER_DAY = 10, PER_DAY_TRIAL = 3, PER_MONTH = 30

const ROW = {
  id: videos.id, uploadId: videos.uploadId, assetId: videos.assetId, playbackId: videos.playbackId, muxEnv: videos.muxEnv,
  durationMs: videos.durationMs, width: videos.width, height: videos.height, createdAt: videos.createdAt, readyAt: videos.readyAt,
  mp4ReadyAt: videos.mp4ReadyAt, erroredAt: videos.erroredAt, error: videos.error, removedAt: videos.removedAt,
}
export type Video = VideoRow & { id: string; assetId: string | null; muxEnv: string; durationMs: number | null; width: number | null; height: number | null }

export async function videoOf(tx: Tx, id: string): Promise<Video | null> {
  const [v] = await tx.select(ROW).from(videos).where(eq(videos.id, id))
  return v ?? null
}

/**
 * A pending row, under the shop's caps, read and written under a per-shop lock so two starts can't race past them
 * (security review finding 1). The caller commits it, then asks Mux for the upload.
 */
export async function startVideo(tx: Tx, tenantId: string, memberId: string, muxEnv: string, now: Date): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('videos:' || ${tenantId}))`)
  const dayAgo = new Date(now.getTime() - 86_400_000), monthAgo = new Date(now.getTime() - 30 * 86_400_000)
  const recent = await tx.select(ROW).from(videos).where(gt(videos.createdAt, monthAgo))
  const [plan] = await tx.select({ trialEndsAt: tenantPlans.trialEndsAt }).from(tenantPlans)
    .where(and(eq(tenantPlans.tenantId, tenantId), lte(tenantPlans.startsAt, now))).orderBy(sql`${tenantPlans.startsAt} desc`).limit(1)
  const onTrial = !!plan?.trialEndsAt && plan.trialEndsAt > now
  const today = recent.filter((v) => v.createdAt > dayAgo).length
  if (today >= (onTrial ? PER_DAY_TRIAL : PER_DAY)) return { ok: false, error: onTrial ? 'Three videos a day on a trial. Try again tomorrow.' : 'Ten videos a day. Try again tomorrow.' }
  if (recent.length >= PER_MONTH) return { ok: false, error: 'Thirty videos a month. Remove one you don’t use, or try again next month.' }
  const live = await tx.select(ROW).from(videos).where(isNull(videos.removedAt))
  if (live.filter((v) => isLive(v, now)).length >= MAX_LIVE) return { ok: false, error: 'Your shop holds 20 videos. Remove one first.' }
  // Only these three columns: the app may insert nothing else (drizzle/0081, tenancy audit H1), and drizzle's insert
  // would name every column (as DEFAULT), which Postgres checks too.
  const [r] = await tx.execute<{ id: string }>(sql`insert into videos (tenant_id, mux_env, created_by) values (${tenantId}, ${muxEnv}, ${memberId}) returning id`) as unknown as { id: string }[]
  return { ok: true, id: r!.id }
}

/** Mux answered with the upload: the row now knows it (the webhook definer routes by it). */
export async function setUpload(tx: Tx, id: string, uploadId: string) {
  await tx.update(videos).set({ uploadId }).where(and(eq(videos.id, id), isNull(videos.uploadId)))
}

/** The upload couldn't be made, or Mux said the asset failed: "Didn't work". */
export async function failVideo(tx: Tx, id: string, error: string, now: Date) {
  await tx.update(videos).set({ erroredAt: now, error: error.slice(0, 40) }).where(and(eq(videos.id, id), isNull(videos.erroredAt)))
}

/**
 * Removed for good: the row says so and the Mux side is queued in the same transaction (an asset is deleted, an upload
 * still open is closed). Used by Cancel, and at publish or discard for videos nothing references any more.
 */
export async function removeVideo(tx: Tx, tenantId: string, v: Pick<Video, 'id' | 'uploadId' | 'assetId' | 'removedAt'>, now: Date) {
  if (!v.removedAt) await tx.update(videos).set({ removedAt: now }).where(and(eq(videos.id, v.id), isNull(videos.removedAt)))
  if (v.assetId) await enqueue(tx, { tenantId, kind: 'mux.asset.delete', dedupeKey: `mux.asset.delete:${v.id}`, payload: { videoId: v.id } })
  else if (v.uploadId) await enqueue(tx, { tenantId, kind: 'mux.upload.cancel', dedupeKey: `mux.upload.cancel:${v.id}`, payload: { videoId: v.id } })
}

/** The videos any stored look of the shop references (the open draft, the live look and its history: Undo works). */
async function referenced(tx: Tx, tenantId: string): Promise<Set<string>> {
  const rows = await tx.execute<{ id: string }>(sql`
    select distinct s->'video'->>'id' as id from ${shopThemeRevisions} r, jsonb_array_elements(coalesce(r.settings->'home', '[]'::jsonb)) s
    where r.tenant_id = ${tenantId} and jsonb_typeof(s->'video') = 'object'`)
  return new Set((rows as unknown as { id: string }[]).map((r) => r.id).filter(Boolean))
}

/** Young rows may be mid-upload, not yet saved into the draft: they are left alone until the upload window is long shut. */
const SETTLED_MS = 2 * 60 * 60_000

/**
 * At publish and at discard: every video no stored look references, and older than an upload could still be, is
 * removed and its Mux side queued. Draft edits (Replace, Remove) only detach; nothing is deleted while a look can come
 * back to it (architecture review 2026-11-09, finding 5).
 */
export async function releaseUnusedVideos(tx: Tx, tenantId: string, now: Date): Promise<number> {
  const used = await referenced(tx, tenantId)
  const cutoff = new Date(now.getTime() - SETTLED_MS)
  const rows = await tx.select(ROW).from(videos).where(and(isNull(videos.removedAt), lt(videos.createdAt, cutoff)))
  const gone = rows.filter((v) => !used.has(v.id))
  for (const v of gone) await removeVideo(tx, tenantId, v, now)
  return gone.length
}

/**
 * The save check (architecture review minor): a video id in a saved look must be one of this shop's own rows, not
 * removed. Anything else is dropped from the section (the photo shows). Returns the layer, and whether it changed.
 */
export async function cleanVideos<L extends { home?: unknown[] }>(tx: Tx, layer: L): Promise<L> {
  const ids = (layer.home ?? []).flatMap((s) => { const id = (s as { video?: { id?: unknown } })?.video?.id; return typeof id === 'string' ? [id] : [] })
  if (!ids.length) return layer
  const ok = new Set((await tx.select({ id: videos.id }).from(videos).where(and(inArray(videos.id, ids), isNull(videos.removedAt)))).map((r) => r.id))
  const home = (layer.home ?? []).map((s) => {
    const v = (s as { video?: { id?: unknown } })?.video
    if (v === undefined || (typeof v?.id === 'string' && ok.has(v.id))) return s
    const { video: _drop, ...rest } = s as Record<string, unknown>
    return rest
  })
  return { ...layer, home }
}

/** The console's field: one video's state, derived. */
export async function videoStatus(tx: Tx, id: string, now: Date): Promise<(VideoState & { durationMs: number | null; width: number | null; height: number | null }) | null> {
  const v = await videoOf(tx, id)
  return v ? { ...videoState(v, now), durationMs: v.durationMs, width: v.width, height: v.height } : null
}

/** The status read the console polls while a video is getting ready (its own short transaction). */
export const videoStatusFor = (tenantId: string, id: string, now: Date) => withTenant(tenantId, (tx) => videoStatus(tx, id, now))

/** For the shop: the playable videos among these ids (the live look's), id → playback id and size. */
export async function playableVideos(tx: Tx, ids: string[], now: Date): Promise<Record<string, { playbackId: string; width: number | null; height: number | null }>> {
  if (!ids.length) return {}
  const rows = await tx.select(ROW).from(videos).where(and(inArray(videos.id, ids.slice(0, 40)), isNull(videos.removedAt)))
  const out: Record<string, { playbackId: string; width: number | null; height: number | null }> = {}
  for (const v of rows) { const s = videoState(v, now); if (s.kind === 'playable') out[v.id] = { playbackId: s.playbackId, width: v.width, height: v.height } }
  return out
}

/** The shop's read (cached in storefront.ts shopVideos) and the preview's (uncached): ids are the look's, comma-joined. */
export const playableVideosFor = (tenantId: string, key: string) => withTenant(tenantId, (tx) => playableVideos(tx, key ? key.split(',').slice(0, 40) : [], new Date()))
export const previewVideos = playableVideosFor
