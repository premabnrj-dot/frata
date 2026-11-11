import 'server-only'
import { fetchWithTimeout } from '@/lib/http/timeout'
import { MUX_API_BASE, MUX_TOKEN_ID, MUX_TOKEN_SECRET } from '@/lib/env'
import { USE_LIMITS, type VideoUse } from '@/domains/video/state'

// =============================================================================
// FILE: src/lib/video/mux.ts — the four calls Frrata makes to Mux (V1, docs/plans/2026-11-09-video-v1.md;
// facts: frata-integrations § Mux). Every call is a row first: create upload is an attempt row (ADR-0008, the
// videos row), delete and cancel are outbox kinds (ADR-0006). Never logs a URL, an id with a token, or a body.
// =============================================================================

/** The upload settings: free encoding, public playback (the shop's cache), one standard `highest` MP4 (no prep cost,
 *  any source size; up to 1080p, Mux's default tier). Mux refuses a 720p tier (tiers are 1080p and up) and refuses
 *  mixing `highest` with sized renditions (2026-11-09, both found as 400s in production). Delivering 720p instead
 *  would need a sized rendition (paid prep, none for a smaller source): a later cost lever, not V1. */
export const UPLOAD_SETTINGS = { video_quality: 'basic', playback_policies: ['public'], static_renditions: [{ resolution: 'highest' }] } as const
export const UPLOAD_TIMEOUT_S = USE_LIMITS.loop.timeoutS

/** PV·1: a product's video is uploaded with NO MP4 (an HLS-only asset is valid). Its paid 720p rendition is added only
 *  once the asset has passed the length and size checks (createRendition, from the outbox): a too-long or tiny upload
 *  never costs prep (unit-economics review 2026-11-10). */
export const uploadSettings = (use: VideoUse) => use === 'loop' ? UPLOAD_SETTINGS
  : { video_quality: 'basic', playback_policies: ['public'] } as const

export type MuxFail = { ok: false; why: 'not_configured' | 'unauthorized' | 'refused' | 'rate_limited' | 'unavailable' | 'bad_reply' }
export type MuxAsset = {
  id: string; status: 'preparing' | 'ready' | 'errored'; passthrough: string | null; uploadId: string | null
  playbackId: string | null; durationMs: number | null; width: number | null; height: number | null
  /** V1: the `highest` MP4 is ready (a loop's). */
  mp4Ready: boolean
  /** Each static rendition's status by resolution (PV·1: a product's `720p`, ready or skipped). */
  renditions: Record<string, 'ready' | 'skipped' | 'errored' | 'preparing'>
}

/** Whether the MP4 a video of this use plays is ready. */
export const mp4ReadyFor = (a: MuxAsset, use: VideoUse) => a.renditions[USE_LIMITS[use].rendition] === 'ready'

const ID = /^[A-Za-z0-9]{1,128}$/
const auth = () => `Basic ${Buffer.from(`${MUX_TOKEN_ID}:${MUX_TOKEN_SECRET}`).toString('base64')}`

async function call(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<{ ok: true; status: number; json: unknown } | MuxFail> {
  if (!MUX_TOKEN_ID || !MUX_TOKEN_SECRET) return { ok: false, why: 'not_configured' }
  let res: Response
  try {
    res = await fetchWithTimeout(`${MUX_API_BASE}${path}`, {
      method, headers: { authorization: auth(), ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store',
    })
  } catch { return { ok: false, why: 'unavailable' } }
  if (res.status === 429) return { ok: false, why: 'rate_limited' }
  // A wrong or rotated token: retried, never counted as Mux refusing this request (security review LOW-2).
  if (res.status === 401 || res.status === 403) return { ok: false, why: 'unauthorized' }
  if (res.status >= 500) return { ok: false, why: 'unavailable' }
  if (res.status === 404 || res.status === 204) return { ok: true, status: res.status, json: null }
  if (res.status >= 400) {
    // Mux says why ({ error: { type, messages } }): its words only, never our URL or token (2026-11-09: a refused
    // upload in production said nothing more than "refused").
    const e = await res.json().catch(() => null) as { error?: { type?: unknown; messages?: unknown } } | null
    const msgs = Array.isArray(e?.error?.messages) ? e.error.messages.filter((m): m is string => typeof m === 'string').join('; ') : ''
    console.error('[mux] refused', method, path.split('/').slice(0, 4).join('/'), res.status, String(e?.error?.type ?? '').slice(0, 40), msgs.slice(0, 300))
    return { ok: false, why: 'refused' }
  }
  try { return { ok: true, status: res.status, json: await res.json() } } catch { return { ok: false, why: 'bad_reply' } }
}

/** A direct upload for one video row: the browser PUTs the file to `url`; Mux carries `passthrough` (our row id) onto
 *  the asset and every event about it. The URL must be https (security review 4) or nothing is handed to the browser. */
export async function createUpload(videoId: string, corsOrigin: string, use: VideoUse = 'loop'): Promise<{ ok: true; uploadId: string; url: string } | MuxFail> {
  const r = await call('POST', '/video/v1/uploads', { cors_origin: corsOrigin, timeout: USE_LIMITS[use].timeoutS, new_asset_settings: { ...uploadSettings(use), passthrough: videoId } })
  if (!r.ok) return r
  const d = (r.json as { data?: { id?: unknown; url?: unknown } } | null)?.data
  if (typeof d?.id !== 'string' || !ID.test(d.id) || typeof d.url !== 'string' || !safeUploadUrl(d.url)) return { ok: false, why: 'bad_reply' }
  return { ok: true, uploadId: d.id, url: d.url }
}

/** https only; the local test's fake Mux (MUX_API_BASE, never Mux's own) may hand back its own http URL. */
function safeUploadUrl(url: string): boolean {
  if (url.length > 4096 || /\s/.test(url)) return false
  if (/^https:\/\/[^/]+\//.test(url)) return true
  try { return MUX_API_BASE !== 'https://api.mux.com' && new URL(url).origin === new URL(MUX_API_BASE).origin } catch { return false }
}

/** The asset as Mux holds it: the processor's source of truth, never an event's order. `null` = Mux has no such asset. */
export async function getAsset(assetId: string): Promise<{ ok: true; asset: MuxAsset | null } | MuxFail> {
  if (!ID.test(assetId)) return { ok: false, why: 'refused' }
  const r = await call('GET', `/video/v1/assets/${assetId}`)
  if (!r.ok) return r
  if (r.status === 404) return { ok: true, asset: null }
  const asset = parseAsset((r.json as { data?: unknown } | null)?.data)
  return asset ? { ok: true, asset } : { ok: false, why: 'bad_reply' }
}

/**
 * Add a static MP4 rendition to a ready asset (PV·1: a product's 720p). Mux answers 201 with the rendition preparing;
 * its webhooks name the asset (`asset_id`), which the row already holds. 404: the asset is gone (done, nothing to make).
 * [V-undated, Mux create-asset-static-rendition, read 2026-11-10]
 */
export async function createRendition(assetId: string, resolution: string): Promise<{ ok: true; gone: boolean } | MuxFail> {
  if (!ID.test(assetId) || !/^\d{3,4}p$/.test(resolution)) return { ok: false, why: 'refused' }
  const r = await call('POST', `/video/v1/assets/${assetId}/static-renditions`, { resolution })
  return r.ok ? { ok: true, gone: r.status === 404 } : r
}

/** Delete an asset. Mux answering 404 is done too (it is already gone). */
export async function deleteAsset(assetId: string): Promise<{ ok: true } | MuxFail> {
  if (!ID.test(assetId)) return { ok: false, why: 'refused' }
  const r = await call('DELETE', `/video/v1/assets/${assetId}`)
  return r.ok ? { ok: true } : r
}

/** Close an upload URL nobody should use any more (Cancel, or a row removed while pending). 404 is done. */
export async function cancelUpload(uploadId: string): Promise<{ ok: true } | MuxFail> {
  if (!ID.test(uploadId)) return { ok: false, why: 'refused' }
  const r = await call('PUT', `/video/v1/uploads/${uploadId}/cancel`)
  // A finished or already cancelled upload is refused by Mux: nothing is left to close.
  return r.ok || r.why === 'refused' ? { ok: true } : r
}

/** Mux's asset object, read defensively: anything missing or odd is null, never a throw. */
export function parseAsset(d: unknown): MuxAsset | null {
  if (!d || typeof d !== 'object') return null
  const a = d as Record<string, unknown>
  if (typeof a.id !== 'string' || !ID.test(a.id)) return null
  const status = a.status === 'ready' || a.status === 'errored' ? a.status : 'preparing'
  const pids = Array.isArray(a.playback_ids) ? a.playback_ids as { id?: unknown; policy?: unknown }[] : []
  const pub = pids.find((p) => p?.policy === 'public' && typeof p.id === 'string' && /^[A-Za-z0-9]{1,64}$/.test(p.id))
  const tracks = Array.isArray(a.tracks) ? a.tracks as { type?: unknown; max_width?: unknown; max_height?: unknown }[] : []
  const video = tracks.find((t) => t?.type === 'video')
  const dim = (n: unknown) => (typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 8192 ? n : null)
  const files = (a.static_renditions as { files?: unknown } | undefined)?.files
  const list = Array.isArray(files) ? files as { name?: unknown; resolution?: unknown; status?: unknown }[] : []
  const mp4Ready = list.some((f) => f?.status === 'ready' && (f.resolution === 'highest' || f.name === 'highest.mp4'))
  const renditions: MuxAsset['renditions'] = {}
  for (const f of list) {
    const res = typeof f?.resolution === 'string' && /^(highest|audio-only|\d{3,4}p)$/.test(f.resolution) ? f.resolution
      : typeof f?.name === 'string' && /^(highest|\d{3,4}p)\.mp4$/.test(f.name) ? f.name.slice(0, -4) : null
    if (res) renditions[res] = f.status === 'ready' || f.status === 'skipped' || f.status === 'errored' ? f.status : 'preparing'
  }
  return {
    id: a.id, status, passthrough: typeof a.passthrough === 'string' ? a.passthrough : null,
    uploadId: typeof a.upload_id === 'string' && ID.test(a.upload_id) ? a.upload_id : null,
    playbackId: pub ? pub.id as string : null,
    durationMs: typeof a.duration === 'number' && a.duration >= 0 && a.duration <= 43_200 ? Math.round(a.duration * 1000) : null,
    width: dim(video?.max_width), height: dim(video?.max_height), mp4Ready, renditions,
  }
}
