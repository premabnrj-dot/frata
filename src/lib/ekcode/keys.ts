import 'server-only'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { E2E_FIXTURES, EKCODE_META_APP_SECRET, EKCODE_PHONE_PEPPERS, EKCODE_SEAL_KEYS, EKCODE_WA_AUTH_TEMPLATE, EKCODE_WA_PHONE_NUMBER_ID, EKCODE_WA_TOKEN } from '@/lib/env'
import { EKCODE_HOST } from '@/lib/public-env'
import { hashes, openRing, parseRing, sealRing, type Ring } from '@/lib/crypto/key-ring'

// =============================================================================
// FILE: src/lib/ekcode/keys.ts — EKCODE'S KEYS, the one owner (P1 task 2; security review M3). Phones, codes and
// network buckets are only ever stored as keyed hashes ("p1:<hex>": the key id travels with the hash so a lookup can
// try every live key); names, phones and addresses are sealed with a key ring and the row's own address as AAD.
// There is no pairwise key: a shop's id for a shopper is a random row (`ekcode_pairs`), deleted on "forget".
// Server only. Never log what passes through here.
// =============================================================================

let rings: { peppers: Ring; seals: Ring } | null = null
const ring = () => (rings ??= { peppers: parseRing(EKCODE_PHONE_PEPPERS), seals: parseRing(EKCODE_SEAL_KEYS) })

/** EkCode can be offered at all: its host, number, template, app secret and both key rings are set. */
export const ekcodeConfigured = () =>
  !!(EKCODE_HOST && EKCODE_WA_PHONE_NUMBER_ID && EKCODE_WA_TOKEN && EKCODE_WA_AUTH_TEMPLATE && EKCODE_META_APP_SECRET
    && ring().peppers.length && ring().seals.length)
/** In the e2e stack the fakes stand in for Meta; the rings and host must still be set. */
export const ekcodeTesting = () => E2E_FIXTURES

/** A 10-digit Indian mobile → the hash to store and every hash to look it up by. */
export const phoneKeys = (mobile: string) => hashes(ring().peppers, 'phone', mobile)
/** A code's keyed hash, bound to the code row's id so one code can't verify another row. */
export const codeKeys = (codeId: string, code: string) => hashes(ring().peppers, 'code', `${codeId}|${code}`)
/** A network bucket's keyed hash (never a plain hash: an IPv4 address is cheap to reverse, security review M3). */
export const networkKeys = (bucket: string) => hashes(ring().peppers, 'net', bucket)

/** Sealed with the newest key; `aad` is "<table>:<column>:<row id>". */
export const ekSeal = (plain: string, aad: string) => sealRing(ring().seals, plain, aad)
export const ekOpen = (sealed: string, aad: string) => openRing(ring().seals, sealed, aad)

/**
 * Network buckets from clientIp()'s answer (src/lib/http/client-ip.ts ipBucket: a full IPv4, or an IPv6 /64 written
 * "a:b:c:d::/64"): IPv4 → its /24 (narrow) and /16 (wide); IPv6 → its /64 and /48. Anything else is one shared bucket
 * (counted, never trusted).
 */
export function networkBuckets(bucket: string): { narrow: string; wide: string } {
  const v = String(bucket ?? '').trim().toLowerCase()
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(v)
  if (v4) return { narrow: `4:${v4[1]}.${v4[2]}.${v4[3]}`, wide: `4:${v4[1]}.${v4[2]}` }
  const v6 = /^([0-9a-f]{1,4}):([0-9a-f]{1,4}):([0-9a-f]{1,4}):([0-9a-f]{1,4})::\/64$/.exec(v)
  if (v6) return { narrow: `6:${v6.slice(1, 5).join(':')}`, wide: `6:${v6.slice(1, 4).join(':')}` }
  return { narrow: 'x:unknown', wide: 'x:unknown' }
}

/** 32 random bytes, URL-safe: states, verifiers, grant codes, session tokens, flow handles. */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url')
/** PKCE S256 (RFC 7636): base64url(sha256(verifier)). */
export const s256 = (verifier: string) => createHash('sha256').update(verifier).digest('base64url')
/** What the database keeps of a one-time token: its sha256 (hex). */
export const tokenDigest = (token: string) => createHash('sha256').update(token).digest('hex')
/** Compares two strings without leaking where they differ. */
export function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b))
  return x.length === y.length && timingSafeEqual(x, y)
}
/** A 6-digit code from a cryptographic source. */
export const newCode = () => String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, '0')
