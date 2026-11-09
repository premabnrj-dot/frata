import 'server-only'
import { withTenant } from '@/lib/db/tenant'
import { MUX_ENVIRONMENT_ID } from '@/lib/env'
import { GiveUp, type OutboxRow } from '@/lib/outbox'
import { videoOf } from '@/lib/queries/videos'
import { cancelUpload, deleteAsset, getAsset } from './mux'

// =============================================================================
// FILE: src/lib/video/senders.ts — the outbox's Mux kinds (V1). Each reads the ids from the shop's own videos row,
// never from the payload (security review finding 5), and only in the Mux environment the row was made in: a row
// from another environment waits (it is never counted as done, security review finding 2).
// =============================================================================

async function rowFor(o: OutboxRow) {
  const videoId = (o.payload as { videoId?: unknown })?.videoId
  if (typeof videoId !== 'string') throw new GiveUp('no video id')
  const v = await withTenant(o.tenantId, (tx) => videoOf(tx, videoId))
  if (!v) throw new GiveUp('no such video')
  if (v.muxEnv !== MUX_ENVIRONMENT_ID) throw new Error('another Mux environment')
  return v
}
const fail = (r: { ok: false; why: string }) => { if (r.why === 'refused') throw new GiveUp(`mux refused`); throw new Error(`mux ${r.why}`) }

/** Delete the asset of a removed video, after Mux confirms it is this video's (tenancy audit 2026-11-09, H1). */
export async function sendAssetDelete(o: OutboxRow) {
  const v = await rowFor(o)
  if (!v.assetId) return
  const got = await getAsset(v.assetId)
  if (!got.ok) return fail(got)
  if (!got.asset) return // already gone
  if (got.asset.passthrough !== v.id) throw new GiveUp('asset is not this video’s')
  const r = await deleteAsset(v.assetId)
  if (!r.ok) fail(r)
}

/** Close the upload URL of a cancelled or abandoned video. */
export async function sendUploadCancel(o: OutboxRow) {
  const v = await rowFor(o)
  if (!v.uploadId) return
  const r = await cancelUpload(v.uploadId)
  if (!r.ok) fail(r)
}
