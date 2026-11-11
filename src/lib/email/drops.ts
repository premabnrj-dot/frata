import 'server-only'
import { timingSafeEqual } from 'node:crypto'
import { keyedHash, parseRing } from '@/lib/crypto/key-ring'
import { EMAIL_KEYS } from '@/lib/env'

// =============================================================================
// FILE: src/lib/email/drops.ts — THE LINKS IN A SHOPPER'S EMAIL (email plan task 14; security review H5, E·2 M3): an
// HMAC under EMAIL_KEYS over (purpose, order id, the order's email now). No tenant inside (the tenant is the host's);
// each dies when the address changes, so a link sent to a mistyped address stops working once the shop fixes it.
// `drops` opens "Email me new drops" (consent is a tap, a POST, never the GET a mail scanner makes); `order` opens the
// order page and its invoice in place of the order's own token, which never dies.
// =============================================================================

const PURPOSES = { drops: 'email-drops v1', order: 'email-order v1' } as const
type Purpose = keyof typeof PURPOSES
const value = (orderId: string, email: string) => `${orderId}|${email.trim().toLowerCase()}`
export const LINK_TOKEN = /^[a-z][a-z0-9]{0,7}:[0-9a-f]{64}$/

export function emailLinkToken(purpose: Purpose, orderId: string, email: string): string | null {
  const k = parseRing(EMAIL_KEYS)[0]
  return k ? keyedHash(k, PURPOSES[purpose], value(orderId, email)) : null
}

/** True when `token` was made for this purpose, order and its current address, under any live key. */
export function emailLinkTokenOk(purpose: Purpose, orderId: string, email: string, token: string): boolean {
  const id = token.split(':')[0]
  const k = parseRing(EMAIL_KEYS).find((x) => x.id === id)
  if (!k) return false
  const want = Buffer.from(keyedHash(k, PURPOSES[purpose], value(orderId, email))), got = Buffer.from(token)
  return want.length === got.length && timingSafeEqual(want, got)
}
