import 'server-only'
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto'

// =============================================================================
// FILE: src/lib/crypto/key-ring.ts — SEALING AND HASHING WITH KEYS THAT CAN BE ROTATED (EkCode P1 task 2; security
// review M3). A ring is "id:base64key,id:base64key", newest first. A sealed value names the key that sealed it
// ("v2.<id>.<iv>.<ciphertext+tag>"), so a new key can be added in front and old values still open; `needsReseal`
// says when to write them back under the newest key. Keyed hashes are made with every live key on lookup and the
// newest on write. Payment secrets stay on secret-box.ts (one fixed key); this file is for data that must outlive a
// rotation. Server only.
// =============================================================================

export type Ring = { id: string; key: Buffer }[]

const ID = /^[a-z][a-z0-9]{0,7}$/

/** Parses "k2:<base64>,k1:<base64>". Unusable entries are dropped; an empty ring means the feature is off. */
export function parseRing(raw: string): Ring {
  const out: Ring = []
  for (const part of String(raw ?? '').split(',')) {
    const i = part.indexOf(':')
    if (i < 1) continue
    const id = part.slice(0, i).trim()
    const secret = part.slice(i + 1).trim()
    if (!ID.test(id) || secret.length < 32 || out.some((k) => k.id === id)) continue
    out.push({ id, key: Buffer.from(hkdfSync('sha256', secret, 'ekcode', `ring ${id}`, 32)) })
  }
  return out
}

const sub = (key: Buffer, info: string) => Buffer.from(hkdfSync('sha256', key, 'ekcode', info, 32))

/** AES-256-GCM under the newest key; `aad` binds the value to its row and column. */
export function sealRing(ring: Ring, plain: string, aad: string): string {
  const k = ring[0]
  if (!k) throw new Error('key ring is empty')
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', sub(k.key, 'seal v2'), iv)
  c.setAAD(Buffer.from(`${aad}|v2|${k.id}`))
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final(), c.getAuthTag()])
  return `v2.${k.id}.${iv.toString('base64url')}.${body.toString('base64url')}`
}

/** The plain text, or null (unknown key id, wrong row, tampering). */
export function openRing(ring: Ring, sealed: string, aad: string): string | null {
  try {
    const [v, id, ivB, bodyB] = String(sealed).split('.')
    const k = ring.find((x) => x.id === id)
    if (v !== 'v2' || !k || !ivB || !bodyB) return null
    const body = Buffer.from(bodyB, 'base64url')
    const d = createDecipheriv('aes-256-gcm', sub(k.key, 'seal v2'), Buffer.from(ivB, 'base64url'))
    d.setAAD(Buffer.from(`${aad}|v2|${k.id}`))
    d.setAuthTag(body.subarray(body.length - 16))
    return Buffer.concat([d.update(body.subarray(0, body.length - 16)), d.final()]).toString('utf8')
  } catch {
    return null
  }
}

/** True when a sealed value was made with an older key and should be written back sealed with the newest. */
export const needsReseal = (ring: Ring, sealed: string) => !!ring[0] && String(sealed).split('.')[1] !== ring[0].id

/** A keyed hash under one key: "<id>:<hex>". The id travels with it, so a lookup can try every live key. */
export const keyedHash = (k: Ring[number], purpose: string, value: string) =>
  `${k.id}:${createHmac('sha256', sub(k.key, `hash ${purpose}`)).update(value).digest('hex')}`

/** The hash to write (newest key) and every hash to look up with (all live keys, newest first). */
export function hashes(ring: Ring, purpose: string, value: string): { write: string; lookup: string[] } {
  if (!ring[0]) throw new Error('key ring is empty')
  const lookup = ring.map((k) => keyedHash(k, purpose, value))
  return { write: lookup[0]!, lookup }
}
