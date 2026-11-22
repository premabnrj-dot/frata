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
/** A sign-in lives 10 minutes (the database holds the same); the CLI polls no faster than every 5 seconds. */
export const DEVICE_CODE_MINUTES = 10
export const DEVICE_POLL_SECONDS = 5
/** The confirm page asks for a passkey check no older than this (the amendment's "in the last 5 minutes"). */
export const DEVICE_CONFIRM_FRESH_MS = 5 * 60_000

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

/** The build key's name on Settings › Website, set by Frrata (mockup words: "Kabir’s computer"): the email's name. */
export function deviceKeyName(email: string): string {
  const who = (email.split('@')[0] ?? '').replace(/[^\p{L}\p{N}._-]/gu, '').slice(0, KEY_NAME_MAX - 12)
  return who ? `${who}’s computer` : 'Developer’s computer'
}
