import 'server-only'
import { createHash } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db } from './index'

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
} as const satisfies Record<string, Limit>

/** Counts one attempt; true when it is within the limit. `failClosed`: refuse when the counter cannot be read (placing orders). */
export async function withinLimit(limit: Limit, subject: string, now = new Date(), failClosed = false): Promise<boolean> {
  const key = createHash('sha256').update(`${limit.action}:${subject.trim().toLowerCase()}`).digest('hex')
  const windowMs = limit.windowSeconds * 1000
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs)
  try {
    const rows = await db().execute<{ n: number }>(sql`
      insert into rate_limits (key, window_start, n) values (${key}, ${windowStart}, 1)
      on conflict (key, window_start) do update set n = rate_limits.n + 1
      returning n`)
    // Old windows are swept now and then, not on every call.
    if (Math.random() < 0.01) await db().execute(sql`delete from rate_limits where window_start < now() - interval '1 day'`)
    return (rows[0]?.n ?? 0) <= limit.max
  } catch (err) {
    console.error('[withinLimit]', limit.action, err instanceof Error ? err.message : err)
    return !failClosed
  }
}
