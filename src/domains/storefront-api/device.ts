// =============================================================================
// FILE: src/domains/storefront-api/device.ts
//
// G·3: A DEVELOPER'S DEVICE SIGN-IN, ITS SHAPES (Studio spec § 10; ADR-0018's build-key amendment, point 1). The CLI
// (`npx frrata dev <store>`) holds a device secret and shows the person a short code to confirm in Frrata; only their
// sha256s are stored. The code is 8 characters from an alphabet with no vowels (no words) and no look-alikes (0/O, 1/I),
// shown as XXXX-XXXX; typed any case, with or without the dash. Pure: the random bytes come from the caller.
// =============================================================================

import { KEY_NAME_MAX } from './keys'

const ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ23456789' // 28 characters
const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
/** The CLI polls no faster than every 5 seconds (a sign-in lives 10 minutes: the database's CHECK and definer). */
export const DEVICE_POLL_SECONDS = 5
/** Where the person confirms their own code (four screens § 2): Partner workspace › Developer, on the console host. */
export const DEVICE_VERIFY_PATH = '/partner/developer'
/** The developer's terminal, word for word as drawn (four screens § 2); the CLI prints these from the start's answer. */
export const DEVICE_TERMINAL = {
  open: (verify: string) => `Open ${verify.replace(/^https:\/\//, '')}`,
  code: (code: string) => `Code ${code} ends in 10 minutes`,
  waiting: 'Waiting for you to confirm…',
  done: 'Signed in. This computer has a key for 24 hours.',
} as const

/**
 * The network a request came from, for the confirm dialog's "Your network" (never stored as written: the caller keeps
 * its sha256). Takes `ipBucket`'s answer: an IPv6 address is already its /64; an IPv4 address becomes its /24. Anything
 * else (unknown, malformed): null, and the dialog marks nothing.
 */
export function networkOf(bucket: string): string | null {
  if (/^[0-9a-f:]+::\/64$/.test(bucket)) return bucket
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(bucket)
  if (!v4 || v4.slice(1).some((o) => Number(o) > 255)) return null
  return `${v4[1]}.${v4[2]}.${v4[3]}.0/24`
}

/** The code a person types: 8 characters, uniform over the alphabet (rejection sampling: 252 = 9 × 28). */
export function newDeviceCode(random: (n: number) => Uint8Array): string {
  let out = ''
  while (out.length < 8) for (const b of random(16)) { if (b < 252 && out.length < 8) out += ALPHABET[b % 28] }
  return `${out.slice(0, 4)}-${out.slice(4)}`
}
/** What a person typed, as the code it names, or null (wrong length or a character the alphabet doesn't have). */
export function deviceCodeOf(typed: string): string | null {
  const s = typed.toUpperCase().replace(/[\s-]/g, '')
  return s.length === 8 && [...s].every((c) => ALPHABET.includes(c)) ? `${s.slice(0, 4)}-${s.slice(4)}` : null
}
/** The CLI's secret: 32 random bytes, base64url (43 characters). */
export function newDeviceSecret(random: (n: number) => Uint8Array): string {
  const bytes = random(32)
  let bits = 0, acc = 0, out = ''
  for (const b of bytes) { acc = (acc << 8) | b; bits += 8; while (bits >= 6) { bits -= 6; out += B64URL[(acc >> bits) & 63] } acc &= (1 << bits) - 1 }
  return bits ? out + B64URL[(acc << (6 - bits)) & 63] : out
}
export const isDeviceSecret = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9_-]{43}$/.test(s)
/** A store slug as the CLI may name it (the tenants' own shape). */
export const isStoreSlug = (s: unknown): s is string => typeof s === 'string' && /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(s)

/** The build key's name on Settings › Website, set by Frrata (four screens § 2: "kabir@neelstudio.in’s computer"): the
 *  whole email when it fits the key name's length, else the part before the @. */
export function deviceKeyName(email: string): string {
  const whole = email.trim().toLowerCase()
  if (/^[\p{L}\p{N}._+-]+@[\p{L}\p{N}.-]+$/u.test(whole) && whole.length + 11 <= KEY_NAME_MAX) return `${whole}’s computer`
  const who = (whole.split('@')[0] ?? '').replace(/[^\p{L}\p{N}._-]/gu, '').slice(0, KEY_NAME_MAX - 12)
  return who ? `${who}’s computer` : 'Developer’s computer'
}

/** The dialog's Started row (four screens § 2): "just now", "1 minute ago", "2 minutes ago" (a code lives 10 minutes). */
export function startedWords(startedAt: Date, now: Date): string {
  const min = Math.floor((now.getTime() - startedAt.getTime()) / 60_000)
  return min < 1 ? 'just now' : min === 1 ? '1 minute ago' : `${min} minutes ago`
}
/** A key's end on Your computers: "ends in 21 hours", under an hour "ends in 40 minutes" (a key lives 24 hours). */
export function endsInWords(expiresAt: Date, now: Date): string {
  const min = Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 60_000))
  if (min < 60) return min === 1 ? 'ends in 1 minute' : `ends in ${min} minutes`
  const h = Math.floor(min / 60)
  return h === 1 ? 'ends in 1 hour' : `ends in ${h} hours`
}
