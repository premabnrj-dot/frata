import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { STOREFRONT_PREVIEW_KEY } from '@/lib/env'
import { PREVIEW_SECONDS, TOKEN_SHAPE, payloadOk, type PreviewEntry } from '@/domains/storefront-api/preview'

// =============================================================================
// FILE: src/lib/storefront-api/preview-token.ts — SIGNS AND CHECKS A PREVIEW TOKEN (ADR-0018 § 12; SA1b plan D·4,
// security review M2). The MAC covers a fixed context, the store and the key (from apiRequest's ctx, never the token)
// and the payload segment; the expected signature is recomputed and compared after a length check, before the payload
// is parsed. Without STOREFRONT_PREVIEW_SECRET (Production only, 32 bytes or more) nothing is signed or accepted.
// =============================================================================

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url')
const mac = (key: Buffer, tenantId: string, keyId: string, payload: string) =>
  createHmac('sha256', key).update(`frrata-preview-v1.${tenantId}.${keyId}.${payload}`).digest('base64url')

/** Whether previews can be made at all (the console hides its button otherwise). */
export const previewsOn = () => STOREFRONT_PREVIEW_KEY !== null

/** A token for one entry under one key of one store, for ten minutes; null when previews are off. */
export function signPreview(scope: { tenantId: string; keyId: string }, entry: PreviewEntry, now: Date): string | null {
  const key = STOREFRONT_PREVIEW_KEY
  if (!key) return null
  const payload = b64(JSON.stringify({ e: entry, x: Math.floor(now.getTime() / 1000) + PREVIEW_SECONDS }))
  return `v1.${payload}.${mac(key, scope.tenantId, scope.keyId, payload)}`
}

/** Whether `token` opens `entry` for this store and key now. Any miss is false (the caller answers its one 404). */
export function previewOk(token: string | null, scope: { tenantId: string; keyId: string }, entry: PreviewEntry, now: Date): boolean {
  const key = STOREFRONT_PREVIEW_KEY
  if (!key || !token || !TOKEN_SHAPE.test(token)) return false
  const [, payload, sig] = token.split('.') as [string, string, string]
  const want = Buffer.from(mac(key, scope.tenantId, scope.keyId, payload))
  const got = Buffer.from(sig)
  if (got.length !== want.length || !timingSafeEqual(got, want)) return false
  let raw: unknown
  try { raw = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) } catch { return false }
  return payloadOk(raw, entry, Math.floor(now.getTime() / 1000))
}
