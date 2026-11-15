// =============================================================================
// FILE: src/domains/storefront-api/keys.ts
//
// A STOREFRONT KEY'S SHAPE (ADR-0018 § 2): `frs_pub_` (live) or `frs_test_` (test), 32 random base62 characters, then a
// 6-character checksum (CRC32 of everything before it, in base62). Shape and checksum are checked here, before any
// database read; the checksum is public, so it only stops typos and cheap junk, never a guesser (the WAF and the miss
// limit do that). Stored is the key's sha256; the shown prefix is for people to recognise a key, never a lookup or a
// limit key. Pure: the random bytes come from the caller (crypto.getRandomValues), never Math.random.
// =============================================================================

import { holds } from '../tenancy/roles'

export const KEY_KINDS = ['public', 'test'] as const
export type KeyKind = (typeof KEY_KINDS)[number]

const PREFIX: Record<KeyKind, string> = { public: 'frs_pub_', test: 'frs_test_' }
const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const RANDOM_CHARS = 32
const CHECK_CHARS = 6
const SHAPE = /^frs_(pub|test)_([0-9A-Za-z]{38})$/

/** Test keys end after 30 days at most, and all end when the store opens (ADR-0018 decision 4). */
export const TEST_KEY_DAYS = 30
/** Live (not deleted, not ended) keys a store may hold at once. */
export const MAX_LIVE_KEYS = 20
export const KEY_NAME_MAX = 40

let table: Uint32Array | null = null
function crc32(text: string): number {
  if (!table) {
    table = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (let i = 0; i < text.length; i++) crc = (table[(crc ^ text.charCodeAt(i)) & 0xff] ?? 0) ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function checksum(head: string): string {
  let n = crc32(head)
  let out = ''
  for (let i = 0; i < CHECK_CHARS; i++) { out = B62[n % 62] + out; n = Math.floor(n / 62) }
  return out
}

/** The key's kind if its shape and checksum hold; null otherwise (a 404 with no lookup). */
export function keyShape(key: string): { kind: KeyKind } | null {
  if (typeof key !== 'string' || key.length > 64) return null
  const m = SHAPE.exec(key)
  if (!m) return null
  const head = key.slice(0, key.length - CHECK_CHARS)
  if (checksum(head) !== key.slice(-CHECK_CHARS)) return null
  return { kind: m[1] === 'pub' ? 'public' : 'test' }
}

/**
 * A new key. `random(n)` returns n random bytes (crypto.getRandomValues); bytes ≥ 248 are dropped so every base62
 * character is equally likely (rejection sampling: 248 = 4 × 62).
 */
export function newKey(kind: KeyKind, random: (n: number) => Uint8Array): string {
  let body = ''
  while (body.length < RANDOM_CHARS) {
    for (const b of random(RANDOM_CHARS)) {
      if (b >= 248) continue
      body += B62[b % 62]
      if (body.length === RANDOM_CHARS) break
    }
  }
  const head = PREFIX[kind] + body
  return head + checksum(head)
}

/** What a person sees of a key once it is made: its kind and the first 6 random characters. */
export const shownPrefix = (key: string) => key.slice(0, key.indexOf('_', 4) + 1 + 6)

/** A name that holds a key (pasted by mistake) is refused, so a key never lands in a stored field. */
export const looksLikeKey = (name: string) => /frs_(pub|test)_/i.test(name) || /[0-9A-Za-z]{30,}/.test(name)

/**
 * Is `origin` a website address this store may name, given the apex of the connected domain it picked? Only
 * `https://<apex>` or `https://www.<apex>`: no path, port or other subdomain (security review 2026-11-15: a stray
 * subdomain is a takeover risk). The database checks the same against the row it names (app_site_origin_check).
 */
export function siteOriginProblem(origin: string, apex: string): 'shape' | 'not_this_domain' | null {
  const m = /^https:\/\/([a-z0-9.-]+)$/.exec(origin)
  if (!m) return 'shape'
  const host = m[1]
  const a = apex.toLowerCase()
  return host === a || host === `www.${a}` ? null : 'not_this_domain'
}

/**
 * May this person create or delete keys and move the Website (ADR-0018 decision 5): the capability `api.manage`
 * (owners, Managers, a partner), a partner only while the store has no owner; never on a support visit (the caller adds
 * that). `holds` is the one capability test (src/domains/tenancy/roles.ts).
 */
export function mayManageApi(role: string, hasOwner: boolean): boolean {
  if (!holds(role, 'api.manage')) return false
  // Who runs the store (shop.manage: owners, Managers) always; anyone else holding api.manage (a partner) only while the
  // store has no owner.
  return holds(role, 'shop.manage') || !hasOwner
}

/** What a key's row says on screen, derived as the definer derives it (never stored). */
export type KeyState =
  | { kind: 'live' }
  | { kind: 'test'; endsAt: string }
  | { kind: 'deleted'; at: string }
  | { kind: 'ended'; why: 'expired' | 'opened'; at: string | null }
  | { kind: 'partner_gone'; at: string | null }

export function keyState(k: { kind: KeyKind; expiresAt: string | null; revokedAt: string | null; partnerId: string | null },
  store: { firstOpenedAt: string | null; partnerLinks: { partnerId: string; removedAt: string | null }[] }, now: Date): KeyState {
  if (k.revokedAt) return { kind: 'deleted', at: k.revokedAt }
  if (k.partnerId) {
    const live = store.partnerLinks.some((l) => l.partnerId === k.partnerId && !l.removedAt)
    if (!live) return { kind: 'partner_gone', at: store.partnerLinks.filter((l) => l.partnerId === k.partnerId).map((l) => l.removedAt).sort().at(-1) ?? null }
  }
  if (k.kind === 'test') {
    if (store.firstOpenedAt) return { kind: 'ended', why: 'opened', at: store.firstOpenedAt }
    if (k.expiresAt && Date.parse(k.expiresAt) <= now.getTime()) return { kind: 'ended', why: 'expired', at: k.expiresAt }
    return { kind: 'test', endsAt: k.expiresAt ?? '' }
  }
  return { kind: 'live' }
}

/** A key still answers (shown first, with Delete). */
export const keyAnswers = (s: KeyState) => s.kind === 'live' || s.kind === 'test'

/** When a key was last used, in words: "Used today", "Used yesterday", "Used 13 Nov", "Never used". India's days. */
export function lastUsed(lastSeenOn: string | null, now: Date, dayMonth: (d: Date) => string): string {
  if (!lastSeenOn) return 'Never used'
  const today = new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10)
  const yesterday = new Date(now.getTime() + 330 * 60_000 - 86_400_000).toISOString().slice(0, 10)
  if (lastSeenOn === today) return 'Used today'
  if (lastSeenOn === yesterday) return 'Used yesterday'
  return `Used ${dayMonth(new Date(`${lastSeenOn}T12:00:00+05:30`))}`
}
