import { createHmac, timingSafeEqual } from 'node:crypto'

// =============================================================================
// FILE: src/lib/video/webhook.ts — Mux's webhook, before anything is stored: the signature on the raw body, then the
// five fields the routing definer (drizzle/0081 app_store_mux_event) takes. Pure, so it is tested without Mux.
// =============================================================================

export const TOLERANCE_S = 300
export const MAX_BODY = 1_000_000

/**
 * `mux-signature: t=<unix seconds>,v1=<hex>[,v1=<hex>]`, HMAC-SHA256 over `${t}.${raw}`; within 5 minutes of now; any
 * of the secrets given (the current and, during a rotation, the previous). Constant-time; false on anything odd.
 */
export function verifyMuxSignature(raw: string, header: string | null, secrets: string[], nowS: number): boolean {
  if (!header || header.length > 1000) return false
  const parts = header.split(',').map((p) => p.trim().split('='))
  const t = parts.find(([k]) => k === 't')?.[1]
  const sigs = parts.filter(([k, v]) => k === 'v1' && v && /^[0-9a-f]{64}$/.test(v)).map(([, v]) => Buffer.from(v!, 'hex'))
  if (!t || !/^[0-9]{1,12}$/.test(t) || !sigs.length || Math.abs(nowS - Number(t)) > TOLERANCE_S) return false
  return secrets.filter(Boolean).some((secret) => {
    const want = createHmac('sha256', secret).update(`${t}.${raw}`).digest()
    return sigs.some((s) => s.length === want.length && timingSafeEqual(s, want))
  })
}

export type MuxEventFields = { env: string; eventId: string; type: string; video: string | null; uploadId: string | null; assetId: string | null; status: string | null }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const str = (v: unknown, re: RegExp) => (typeof v === 'string' && re.test(v) ? v : null)

/**
 * The fields the definer routes by, from Mux's envelope `{ type, id, environment: { id }, data }`. Upload events carry
 * the upload as `data` (id = upload id, passthrough in new_asset_settings); asset events the asset (passthrough,
 * upload_id); rendition events only `asset_id`. Null when the envelope isn't one; the definer checks every value again.
 */
export function muxEventFields(body: unknown): MuxEventFields | null {
  if (!body || typeof body !== 'object') return null
  const b = body as { type?: unknown; id?: unknown; environment?: { id?: unknown }; data?: Record<string, unknown> }
  const type = str(b.type, /^video\.[a-z_.]{1,60}$/), eventId = str(b.id, /^[A-Za-z0-9-]{1,64}$/), env = str(b.environment?.id, /^[A-Za-z0-9_-]{1,40}$/)
  const d = b.data && typeof b.data === 'object' ? b.data : null
  if (!type || !eventId || !env || !d) return null
  const id = /^[A-Za-z0-9]{1,128}$/, status = str(d.status, /^[a-z_]{1,30}$/)
  if (type.startsWith('video.upload.')) {
    const nas = d.new_asset_settings as { passthrough?: unknown } | undefined
    return { env, eventId, type, video: str(nas?.passthrough, UUID), uploadId: str(d.id, id), assetId: str(d.asset_id, id), status }
  }
  if (type.startsWith('video.asset.static_rendition.')) return { env, eventId, type, video: null, uploadId: null, assetId: str(d.asset_id, id), status }
  if (type.startsWith('video.asset.')) return { env, eventId, type, video: str(d.passthrough, UUID), uploadId: str(d.upload_id, id), assetId: str(d.id, id), status }
  return null
}
