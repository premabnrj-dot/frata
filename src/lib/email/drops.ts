import 'server-only'
import { timingSafeEqual } from 'node:crypto'
import { keyedHash, parseRing } from '@/lib/crypto/key-ring'
import { EMAIL_KEYS } from '@/lib/env'

// =============================================================================
// FILE: src/lib/email/drops.ts — THE "EMAIL ME NEW DROPS" LINK (email plan task 14; security review H5): an HMAC
// under EMAIL_KEYS over (order id, purpose, the order's email now). No tenant inside (the tenant is the host's); it
// dies when the address changes. The link only opens a page; consent is a tap (a POST), never the GET a mail scanner makes.
// =============================================================================

const PURPOSE = 'email-drops v1'
const value = (orderId: string, email: string) => `${orderId}|${email.trim().toLowerCase()}`

export function dropsToken(orderId: string, email: string): string | null {
  const k = parseRing(EMAIL_KEYS)[0]
  return k ? keyedHash(k, PURPOSE, value(orderId, email)) : null
}

/** True when `token` was made for this order and its current address, under any live key. */
export function dropsTokenOk(orderId: string, email: string, token: string): boolean {
  const id = token.split(':')[0]
  const k = parseRing(EMAIL_KEYS).find((x) => x.id === id)
  if (!k) return false
  const want = Buffer.from(keyedHash(k, PURPOSE, value(orderId, email))), got = Buffer.from(token)
  return want.length === got.length && timingSafeEqual(want, got)
}
