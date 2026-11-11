import 'server-only'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { USE_LIMITS, loopMp4, mp4Of, videoState } from '@/domains/video/state'
import { webhookEvents } from '@/lib/db/schema'
import { videos } from '@/lib/db/schema-themes'
import { productVideos, products } from '@/lib/db/schema-catalogue'
import { withTenant } from '@/lib/db/tenant'
import { MUX_ENVIRONMENT_ID } from '@/lib/env'
import { errName } from '@/lib/log'
import { drainSoon } from '@/lib/outbox/drain'
import { failVideo, queueAssetDelete, videoOf } from '@/lib/queries/videos'
import { enqueue } from '@/lib/outbox'
import { refreshProduct, refreshShop } from '@/lib/storefront/refresh'
import { getAsset, mp4ReadyFor } from './mux'

// =============================================================================
// FILE: src/lib/video/process.ts — a shop's stored Mux events, processed after the 200 (ADR-0006). The event only says
// WHICH video to look at: the asset is read from Mux (the source of truth, never the events' order) and checked to be
// this row's (passthrough = our id, and its upload) before anything is written (security review finding 3). A too-long
// loop gets no playback id and its asset is queued for deletion; an asset that lands on a removed or failed row is
// queued for deletion too. The shop's cache is refreshed only when a video becomes playable (speed review).
// =============================================================================

type Pending = { id: string; payload: { type?: string; video?: string; asset_id?: string | null; upload_id?: string | null } }

export async function processMux(tenantId: string): Promise<number> {
  const events = await withTenant(tenantId, (tx) => tx.select({ id: webhookEvents.id, payload: webhookEvents.payload }).from(webhookEvents)
    .where(and(eq(webhookEvents.tenantId, tenantId), eq(webhookEvents.provider, 'mux'), isNull(webhookEvents.processedAt)))
    .orderBy(webhookEvents.receivedAt).limit(50)) as Pending[]
  let n = 0, playable = false, queued = false
  const handles = new Set<string>()
  // One look at Mux per video, however many events it sent (about five per asset).
  const seen = new Map<string, Awaited<ReturnType<typeof one>>>()
  for (const e of events) {
    const videoId = e.payload.video
    try {
      if (typeof videoId === 'string' && !seen.has(videoId)) seen.set(videoId, await one(tenantId, videoId, e.payload))
      const r = typeof videoId === 'string' ? seen.get(videoId)! : { playable: false, queued: false, product: false, handle: null }
      playable ||= r.playable && !r.product; queued ||= r.queued
      if (r.playable && r.product && r.handle) handles.add(r.handle)
      await done(tenantId, e.id, e.payload.type ?? 'unknown', null)
      n++
    } catch (err) {
      // Left unprocessed for the daily net; the error's name only (a driver error carries its parameters).
      await withTenant(tenantId, (tx) => tx.update(webhookEvents).set({ lastError: errName(err) }).where(eq(webhookEvents.id, e.id))).catch(() => {})
    }
  }
  if (queued) drainSoon()
  if (playable) refreshShop(tenantId, 'videos')
  // PV·1: a product's video lives in that product's own entry (its own tag, never the catalogue's: speed review).
  for (const h of handles) refreshProduct(tenantId, h)
  return n
}

/** Processed: the payload trimmed to its type (security review: nothing kept that isn't needed). */
const done = (tenantId: string, id: string, type: string, error: string | null) => withTenant(tenantId, (tx) =>
  tx.update(webhookEvents).set({ processedAt: sql`now()`, payload: { type }, lastError: error }).where(and(eq(webhookEvents.tenantId, tenantId), eq(webhookEvents.id, id))))

async function one(tenantId: string, videoId: string, ev: Pending['payload']): Promise<{ playable: boolean; queued: boolean; product: boolean; handle: string | null }> {
  const v = await withTenant(tenantId, (tx) => videoOf(tx, tenantId, videoId))
  if (!v) return { playable: false, queued: false, product: false, handle: null }
  const use = v.use ?? 'loop', lim = USE_LIMITS[use], product = use === 'product'
  // Another Mux environment's row is never looked at with this token (its 404 would read as "gone"): the event waits.
  if (v.muxEnv !== MUX_ENVIRONMENT_ID) throw new Error('another Mux environment')
  const assetId = v.assetId ?? (typeof ev.asset_id === 'string' ? ev.asset_id : null)
  if (!assetId) {
    // Mux says the upload itself failed or was cancelled: there is no asset to look at.
    if (ev.type === 'video.upload.errored' || ev.type === 'video.upload.cancelled') await withTenant(tenantId, (tx) => failVideo(tx, tenantId, v.id, ev.type === 'video.upload.cancelled' ? 'cancelled' : 'upload_errored', new Date()))
    return { playable: false, queued: false, product, handle: null }
  }
  const got = await getAsset(assetId)
  if (!got.ok) throw new Error(`mux ${got.why}`)
  const a = got.asset
  // Not this row's asset (a stale upload, another environment's): nothing is written.
  if (a && (a.passthrough !== v.id || (v.uploadId !== null && a.uploadId !== v.uploadId))) return { playable: false, queued: false, product, handle: null }
  const before = videoState(v, new Date()).kind
  let handle: string | null = null
  const r = await withTenant(tenantId, async (tx) => {
    const now = new Date()
    // The product this video shows on, read in this same transaction (speed review 6: no extra round trip).
    if (product) handle = (await tx.select({ h: products.handle }).from(productVideos).innerJoin(products, and(eq(products.tenantId, productVideos.tenantId), eq(products.id, productVideos.productId)))
      .where(and(eq(productVideos.tenantId, tenantId), eq(productVideos.videoId, v.id))).limit(1))[0]?.h ?? null
    const mine = and(eq(videos.tenantId, tenantId), eq(videos.id, v.id))
    const queue = async () => { await queueAssetDelete(tx, tenantId, v.id); return true }
    // Gone at Mux: "Didn't work" only when the row already held that asset (nothing else proves it was this row's).
    if (!a) { if (v.assetId && !v.removedAt && !v.erroredAt) await failVideo(tx, tenantId, v.id, 'asset_gone', now); return { queued: false } }
    // Mux keeps the asset id once we know it (the trigger refuses a second one).
    if (!v.assetId) await tx.update(videos).set({ assetId }).where(and(mine, isNull(videos.assetId)))
    // Removed while it uploaded, or already failed: it should not exist at Mux.
    if (v.removedAt || v.erroredAt) return { queued: await queue() }
    if (a.status === 'errored') { await failVideo(tx, tenantId, v.id, 'asset_errored', now); return { queued: await queue() } }
    // Not ready, or ready without a length yet (the use's cap can't be checked): look again on the next event.
    if (a.status !== 'ready' || a.durationMs === null) return { queued: false }
    // Outside the use's length (a loop ≤ 15 s; a product 6–60 s), or a product whose 720p Mux skipped (a smaller
    // source: it would never play): no playback id, and the asset goes.
    const short = a.width !== null && a.height !== null ? Math.min(a.width, a.height) : null
    const why = a.durationMs > lim.maxMs ? 'too_long' : a.durationMs < lim.minMs ? 'too_short'
      : product && ((short !== null && short < 720) || a.renditions[lim.rendition] === 'skipped') ? 'too_small'
        // TS1b: a loop's sized MP4 skipped by Mux (a source under 270p): it would never play.
        : !product && v.mp4 && a.renditions[v.mp4] === 'skipped' ? 'too_small' : null
    if (why) {
      await tx.update(videos).set({ durationMs: a.durationMs }).where(mine)
      await failVideo(tx, tenantId, v.id, why, now)
      return { queued: await queue() }
    }
    // TS1b: a loop with no MP4 yet (uploaded without one; a V1 loop has its `highest`) asks for its sized one now, past
    // the checks: the name is recorded in this transaction with the outbox row that asks (ADR-0006), set once.
    const ask = !product && !v.mp4 && !v.mp4ReadyAt && !a.renditions[USE_LIMITS.loop.rendition] ? loopMp4(a.width, a.height) : null
    const mp4 = ask ?? mp4Of(v)
    await tx.update(videos).set({
      ...(v.playbackId ? {} : a.playbackId ? { playbackId: a.playbackId } : {}),
      durationMs: a.durationMs, width: a.width, height: a.height,
      ...(v.readyAt ? {} : { readyAt: now }),
      ...(ask ? { mp4: ask } : {}),
      ...(mp4ReadyFor(a, mp4) && !v.mp4ReadyAt && (v.playbackId || a.playbackId) ? { mp4ReadyAt: now } : {}),
    }).where(mine)
    // PV·1: a product's 720p MP4 is asked for only now, past the checks (unit-economics review 2026-11-10): a row in
    // the outbox in this transaction (ADR-0006); the sender re-reads the row. Once per video (its dedupe key).
    if ((product ? !a.renditions[lim.rendition] && !v.mp4ReadyAt : !!ask && !a.renditions[ask])) {
      await enqueue(tx, { tenantId, kind: 'mux.rendition.create', dedupeKey: `mux.rendition.create:${v.id}`, payload: { videoId: v.id } })
      return { queued: true }
    }
    return { queued: false }
  })
  const after = await withTenant(tenantId, (tx) => videoOf(tx, tenantId, v.id))
  const now = after ? videoState(after, new Date()).kind : 'removed'
  // The shop's video entry changes when a loop starts playing, or a playing one stops (security review LOW-6).
  return { playable: (before === 'playable') !== (now === 'playable'), queued: r.queued, product, handle }
}
