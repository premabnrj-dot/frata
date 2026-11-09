import 'server-only'
import { fetchWithTimeout } from '@/lib/http/timeout'
import { MUX_API_BASE, MUX_TOKEN_ID, MUX_TOKEN_SECRET } from '@/lib/env'

// =============================================================================
// FILE: src/lib/video/mux.ts — the four calls Frrata makes to Mux (V1, docs/plans/2026-11-09-video-v1.md;
// facts: frata-integrations § Mux). Every call is a row first: create upload is an attempt row (ADR-0008, the
// videos row), delete and cancel are outbox kinds (ADR-0006). Never logs a URL, an id with a token, or a body.
// =============================================================================

/** The upload settings decided by the reviews: free encoding, public playback (the shop's cache), one MP4 at the
 *  highest rendition the 720p tier gives, an upload URL alive 15 minutes. */
export const UPLOAD_SETTINGS = { video_quality: 'basic', playback_policies: ['public'], static_renditions: [{ resolution: 'highest' }], max_resolution_tier: '720p' } as const
export const UPLOAD_TIMEOUT_S = 900

export type MuxFail = { ok: false; why: 'not_configured' | 'refused' | 'rate_limited' | 'unavailable' | 'bad_reply' }
export type MuxAsset = {
  id: string; status: 'preparing' | 'ready' | 'errored'; passthrough: string | null; uploadId: string | null
  playbackId: string | null; durationMs: number | null; width: number | null; height: number | null; mp4Ready: boolean
}

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
  if (res.status >= 500) return { ok: false, why: 'unavailable' }
  if (res.status === 404 || res.status === 204) return { ok: true, status: res.status, json: null }
  if (res.status >= 400) return { ok: false, why: 'refused' }
  try { return { ok: true, status: res.status, json: await res.json() } } catch { return { ok: false, why: 'bad_reply' } }
}

/** A direct upload for one video row: the browser PUTs the file to `url`; Mux carries `passthrough` (our row id) onto
 *  the asset and every event about it. The URL must be https (security review 4) or nothing is handed to the browser. */
export async function createUpload(videoId: string, corsOrigin: string): Promise<{ ok: true; uploadId: string; url: string } | MuxFail> {
  const r = await call('POST', '/video/v1/uploads', { cors_origin: corsOrigin, timeout: UPLOAD_TIMEOUT_S, new_asset_settings: { ...UPLOAD_SETTINGS, passthrough: videoId } })
  if (!r.ok) return r
  const d = (r.json as { data?: { id?: unknown; url?: unknown } } | null)?.data
  if (typeof d?.id !== 'string' || !ID.test(d.id) || typeof d.url !== 'string' || !/^https:\/\/[^\s]+$/.test(d.url) || d.url.length > 4096) return { ok: false, why: 'bad_reply' }
  return { ok: true, uploadId: d.id, url: d.url }
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
  const mp4Ready = Array.isArray(files) && (files as { name?: unknown; resolution?: unknown; status?: unknown }[])
    .some((f) => f?.status === 'ready' && (f.resolution === 'highest' || f.name === 'highest.mp4'))
  return {
    id: a.id, status, passthrough: typeof a.passthrough === 'string' ? a.passthrough : null,
    uploadId: typeof a.upload_id === 'string' && ID.test(a.upload_id) ? a.upload_id : null,
    playbackId: pub ? pub.id as string : null,
    durationMs: typeof a.duration === 'number' && a.duration >= 0 && a.duration <= 43_200 ? Math.round(a.duration * 1000) : null,
    width: dim(video?.max_width), height: dim(video?.max_height), mp4Ready,
  }
}
