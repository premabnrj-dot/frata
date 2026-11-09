import 'server-only'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { MAX_LOOP_MS, videoState } from '@/domains/video/state'
import { webhookEvents } from '@/lib/db/schema'
import { videos } from '@/lib/db/schema-themes'
import { withTenant } from '@/lib/db/tenant'
import { errName } from '@/lib/log'
import { enqueue } from '@/lib/outbox'
import { drainSoon } from '@/lib/outbox/drain'
import { failVideo, videoOf } from '@/lib/queries/videos'
import { refreshShop } from '@/lib/storefront/refresh'
import { getAsset } from './mux'

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
  // One look at Mux per video, however many events it sent (about five per asset).
  const seen = new Map<string, Awaited<ReturnType<typeof one>>>()
  for (const e of events) {
    const videoId = e.payload.video
    try {
      if (typeof videoId === 'string' && !seen.has(videoId)) seen.set(videoId, await one(tenantId, videoId, e.payload))
      const r = typeof videoId === 'string' ? seen.get(videoId)! : { playable: false, queued: false }
      playable ||= r.playable; queued ||= r.queued
      await done(tenantId, e.id, e.payload.type ?? 'unknown', null)
      n++
    } catch (err) {
      // Left unprocessed for the daily net; the error's name only (a driver error carries its parameters).
      await withTenant(tenantId, (tx) => tx.update(webhookEvents).set({ lastError: errName(err) }).where(eq(webhookEvents.id, e.id))).catch(() => {})
    }
  }
  if (queued) drainSoon()
  if (playable) refreshShop(tenantId, 'shop')
  return n
}

/** Processed: the payload trimmed to its type (security review: nothing kept that isn't needed). */
const done = (tenantId: string, id: string, type: string, error: string | null) => withTenant(tenantId, (tx) =>
  tx.update(webhookEvents).set({ processedAt: sql`now()`, payload: { type }, lastError: error }).where(and(eq(webhookEvents.tenantId, tenantId), eq(webhookEvents.id, id))))

async function one(tenantId: string, videoId: string, ev: Pending['payload']): Promise<{ playable: boolean; queued: boolean }> {
  const v = await withTenant(tenantId, (tx) => videoOf(tx, videoId))
  if (!v) return { playable: false, queued: false }
  const assetId = v.assetId ?? (typeof ev.asset_id === 'string' ? ev.asset_id : null)
  if (!assetId) {
    // Mux says the upload itself failed or was cancelled: there is no asset to look at.
    if (ev.type === 'video.upload.errored' || ev.type === 'video.upload.cancelled') await withTenant(tenantId, (tx) => failVideo(tx, v.id, ev.type === 'video.upload.cancelled' ? 'cancelled' : 'upload_errored', new Date()))
    return { playable: false, queued: false }
  }
  const got = await getAsset(assetId)
  if (!got.ok) throw new Error(`mux ${got.why}`)
  const a = got.asset
  // Not this row's asset (a stale upload, another environment's): nothing is written.
  if (a && (a.passthrough !== v.id || (v.uploadId && a.uploadId && a.uploadId !== v.uploadId))) return { playable: false, queued: false }
  const before = videoState(v, new Date()).kind
  return withTenant(tenantId, async (tx) => {
    const now = new Date()
    const queue = async () => { await enqueue(tx, { tenantId, kind: 'mux.asset.delete', dedupeKey: `mux.asset.delete:${v.id}`, payload: { videoId: v.id } }); return true }
    // Mux keeps the asset id once we know it (the trigger refuses a second one).
    if (!v.assetId && a) await tx.update(videos).set({ assetId }).where(and(eq(videos.id, v.id), isNull(videos.assetId)))
    if (!a) { if (!v.removedAt && !v.erroredAt) await failVideo(tx, v.id, 'asset_gone', now); return { playable: false, queued: false } }
    // Removed while it uploaded, or already failed: it should not exist at Mux.
    if (v.removedAt || v.erroredAt) return { playable: false, queued: await queue() }
    if (a.status === 'errored') { await failVideo(tx, v.id, 'asset_errored', now); return { playable: false, queued: await queue() } }
    if (a.status !== 'ready') return { playable: false, queued: false }
    if (a.durationMs !== null && a.durationMs > MAX_LOOP_MS) {
      await tx.update(videos).set({ durationMs: a.durationMs }).where(eq(videos.id, v.id))
      await failVideo(tx, v.id, 'too_long', now)
      return { playable: false, queued: await queue() }
    }
    await tx.update(videos).set({
      ...(v.playbackId ? {} : a.playbackId ? { playbackId: a.playbackId } : {}),
      durationMs: a.durationMs, width: a.width, height: a.height,
      ...(v.readyAt ? {} : { readyAt: now }),
      ...(a.mp4Ready && !v.mp4ReadyAt && (v.playbackId || a.playbackId) ? { mp4ReadyAt: now } : {}),
    }).where(eq(videos.id, v.id))
    const after = await videoOf(tx, v.id)
    return { playable: before !== 'playable' && !!after && videoState(after, now).kind === 'playable', queued: false }
  })
}
