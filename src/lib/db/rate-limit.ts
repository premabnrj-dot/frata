import 'server-only'
import { createHash } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db } from './index'
import { errName } from '@/lib/log'

// =============================================================================
// FILE: src/lib/db/rate-limit.ts
//
// ABUSE LIMITS: a fixed-window counter per (action, subject). The subject — an
// email, an IP, a phone — is stored only as a sha256, never as itself
// (rate_limits holds no personal data). Platform scope: no tenant.
// A database error ALLOWS the request: a limiter that fails closed would stop
// every sign-in when the database hiccups, and Supabase keeps its own limits.
// =============================================================================

export type Limit = { action: string; max: number; windowSeconds: number }

export const LIMITS = {
  sendCodeEmail: { action: 'send_code:email', max: 5, windowSeconds: 3600 },
  sendCodeIp: { action: 'send_code:ip', max: 20, windowSeconds: 3600 },
  verifyCodeEmail: { action: 'verify_code:email', max: 10, windowSeconds: 900 },
  createShopIp: { action: 'create_shop:ip', max: 5, windowSeconds: 3600 },
  checkAddressUser: { action: 'check_address:user', max: 120, windowSeconds: 600 },
  // Checkout (1C). Subjects are "<tenant>:<ip>" or "<tenant>:<phone>" (hashed with the action below). Mobile networks share IPs: generous per IP.
  quoteIp: { action: 'shop_quote:ip', max: 300, windowSeconds: 600 },
  placeOrderIp: { action: 'shop_place:ip', max: 30, windowSeconds: 3600 },
  placeOrderPhone: { action: 'shop_place:phone', max: 5, windowSeconds: 3600 },
  payIp: { action: 'shop_pay:ip', max: 60, windowSeconds: 600 },
  /** The shopper's invoice PDF (Documents D2): per shop and IP, failing closed. */
  invoiceIp: { action: 'shop_invoice:ip', max: 20, windowSeconds: 600 },
  // Offer codes that did not apply, per shop and IP ("<tenant>:<ip>"): guessing stops; fail closed. No per-shop block,
  // so one guesser cannot switch off a shop's real codes (offers plan review 11).
  codeIp: { action: 'shop_code:ip', max: 20, windowSeconds: 600 },
  // Once per code per IP per window: the same code re-sent with every re-price counts once (impact review).
  codeSeen: { action: 'shop_code:seen', max: 1, windowSeconds: 600 },
  // Upload tokens per shop (security review S11): four widths per photo, so 200 photos an hour; Frrata pays for storage.
  uploadShop: { action: 'upload:shop', max: 800, windowSeconds: 3600 },
  // PDF documents (Documents D1, security review 2026-11-08): a render is CPU; per member and per shop, fail closed.
  pdfMember: { action: 'pdf:member', max: 30, windowSeconds: 600 },
  pdfShop: { action: 'pdf:shop', max: 120, windowSeconds: 600 },
  // Frrata's billing gateway (B3 security review): each start makes a gateway customer or order; per member, fail closed.
  billingMember: { action: 'billing:member', max: 10, windowSeconds: 600 },
} as const satisfies Record<string, Limit>

/** Whether `subject` is already past the limit, WITHOUT counting an attempt. `failClosed`: true when the counter cannot be read. */
export async function overLimit(limit: Limit, subject: string, now = new Date(), failClosed = false): Promise<boolean> {
  const key = createHash('sha256').update(`${limit.action}:${subject.trim().toLowerCase()}`).digest('hex')
  const windowMs = limit.windowSeconds * 1000
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs)
  try {
    const rows = await db().execute<{ n: number }>(sql`select n from rate_limits where key = ${key} and window_start = ${windowStart.toISOString()}::timestamptz`)
    return (rows[0]?.n ?? 0) >= limit.max
  } catch (err) {
    console.error('[overLimit]', limit.action, errName(err))
    return failClosed
  }
}

/** Counts one attempt; true when it is within the limit. `failClosed`: refuse when the counter cannot be read (placing orders). */
export async function withinLimit(limit: Limit, subject: string, now = new Date(), failClosed = false): Promise<boolean> {
  const key = createHash('sha256').update(`${limit.action}:${subject.trim().toLowerCase()}`).digest('hex')
  const windowMs = limit.windowSeconds * 1000
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs)
  try {
    const rows = await db().execute<{ n: number }>(sql`
      insert into rate_limits (key, window_start, n) values (${key}, ${windowStart.toISOString()}::timestamptz, 1)
      on conflict (key, window_start) do update set n = rate_limits.n + 1
      returning n`)
    // Old windows are swept now and then, not on every call.
    if (Math.random() < 0.01) await db().execute(sql`delete from rate_limits where window_start < now() - interval '1 day'`)
    return (rows[0]?.n ?? 0) <= limit.max
  } catch (err) {
    console.error('[withinLimit]', limit.action, errName(err))
    return !failClosed
  }
}
