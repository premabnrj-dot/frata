import 'server-only'
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes } from 'node:crypto'
import { PAYMENT_KEYS_SECRET } from '@/lib/env'

// =============================================================================
// FILE: src/lib/crypto/secret-box.ts
//
// SECRETS AT REST (checkout spec, tenancy review). AES-256-GCM with a key
// derived (HKDF-SHA256) from PAYMENT_KEYS_SECRET, so any string the owner set
// works. The additional data binds a ciphertext to its shop, its field and the
// format version: a value moved into another shop's row does not decrypt.
// A second derived key signs order links (orderToken). Server only.
// =============================================================================

const VERSION = 'v1'
const key = (info: string) => {
  if (!PAYMENT_KEYS_SECRET) throw new Error('PAYMENT_KEYS_SECRET is not set')
  return Buffer.from(hkdfSync('sha256', PAYMENT_KEYS_SECRET, 'frata', info, 32))
}
const aadFor = (tenantId: string, field: string) => Buffer.from(`${tenantId}|${field}|${VERSION}`)

/** "v1.<iv>.<ciphertext+tag>", base64url. */
export function seal(plain: string, tenantId: string, field: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key('payment-keys v1'), iv)
  c.setAAD(aadFor(tenantId, field))
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final(), c.getAuthTag()])
  return `${VERSION}.${iv.toString('base64url')}.${body.toString('base64url')}`
}

/** The plain text, or null when it cannot be read (another shop's value, a changed secret, tampering). */
export function open(sealed: string, tenantId: string, field: string): string | null {
  try {
    const [v, ivB, bodyB] = sealed.split('.')
    if (v !== VERSION || !ivB || !bodyB) return null
    const body = Buffer.from(bodyB, 'base64url')
    const d = createDecipheriv('aes-256-gcm', key('payment-keys v1'), Buffer.from(ivB, 'base64url'))
    d.setAAD(aadFor(tenantId, field))
    d.setAuthTag(body.subarray(body.length - 16))
    return Buffer.concat([d.update(body.subarray(0, body.length - 16)), d.final()]).toString('utf8')
  } catch {
    return null
  }
}

/** An order's link token: HMAC of its id (128 bits), so a retry can give the same link back; only its hash is stored. */
export const orderToken = (orderId: string) => createHmac('sha256', key('order-links v1')).update(orderId).digest().subarray(0, 16).toString('base64url')
/**
 * A review link (Reviews R1): HMAC over the shop, the order and the request's random nonce, so a link can be reissued
 * (a new nonce) and never opens another shop's order (security review M1). 22 characters, URL-safe. Never stored:
 * the request keeps tokenHash(token).
 */
export const reviewToken = (tenantId: string, orderId: string, nonceHex: string) =>
  createHmac('sha256', key('review-links v1')).update(`${tenantId}|${orderId}|${nonceHex}`).digest().subarray(0, 16).toString('base64url')
/** A phone as the shop's opt-out list keeps it: a keyed hash, per shop (security review H3). Never the number. */
export const phoneHmac = (tenantId: string, phone: string) => createHmac('sha256', key('wa-opt-outs v1')).update(`${tenantId}|${phone}`).digest('hex')
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
