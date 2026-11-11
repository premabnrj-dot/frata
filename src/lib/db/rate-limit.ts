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
  // Own domains D2·10 (security review 2026-11-09): claims per member and shop; the dialog's 15 s check per member,
  // shop and IP bucket, and one budget for all shops (Vercel reads and DoH are shared); all fail closed.
  domainClaimMember: { action: 'domain_claim:member', max: 20, windowSeconds: 3600 },
  domainClaimShop: { action: 'domain_claim:shop', max: 20, windowSeconds: 3600 },
  domainClaimIp: { action: 'domain_claim:ip', max: 30, windowSeconds: 3600 },
  domainClaimAll: { action: 'domain_claim:all', max: 300, windowSeconds: 3600 },
  domainCheckMember: { action: 'domain_check:member', max: 120, windowSeconds: 600 },
  domainCheckShop: { action: 'domain_check:shop', max: 160, windowSeconds: 600 },
  domainCheckIp: { action: 'domain_check:ip', max: 200, windowSeconds: 600 },
  domainCheckAll: { action: 'domain_check:all', max: 3000, windowSeconds: 600 },
  pdfShop: { action: 'pdf:shop', max: 120, windowSeconds: 600 },
  // GST exports (GST app G1): a period's documents rendered whole; per member, fail closed.
  gstExportMember: { action: 'gst_export:member', max: 30, windowSeconds: 600 },
  // Email (E·2; security review H4/M5), all failing closed. An address given at checkout: per shop and across shops,
  // so nobody can use shops to bomb an inbox (over the limit, the order is placed without the email). Test sends per
  // member; Send again and Email the invoice per order and kind (once in 10 minutes, three a day).
  orderEmailShop: { action: 'order_email:shop', max: 3, windowSeconds: 3600 },
  orderEmailGlobal: { action: 'order_email:global', max: 15, windowSeconds: 3600 },
  emailTestMember: { action: 'email_test:member', max: 5, windowSeconds: 3600 },
  emailResendShort: { action: 'email_resend:short', max: 1, windowSeconds: 600 },
  emailResendDay: { action: 'email_resend:day', max: 3, windowSeconds: 86400 },
  // GST filing OTPs (G2): each asks the portal to text the shop's mobile; per shop, fail closed.
  gstOtpShop: { action: 'gst_otp:shop', max: 10, windowSeconds: 3600 },
  // OTPs typed (verify, file): a guess loop stops at the server, before the portal (security review M2).
  gstOtpTry: { action: 'gst_otp_try:shop', max: 8, windowSeconds: 900 },
  // Frrata's billing gateway (B3 security review): each start makes a gateway customer or order; per member, fail closed.
  billingMember: { action: 'billing:member', max: 10, windowSeconds: 600 },
  // Sign-up WhatsApp codes (trials TR1, R2): per person, per phone and per IP; fail closed (a code costs Frrata a message).
  signupCodeUser: { action: 'signup_code:user', max: 5, windowSeconds: 3600 },
  signupCodePhone: { action: 'signup_code:phone', max: 3, windowSeconds: 3600 },
  signupCodeIp: { action: 'signup_code:ip', max: 20, windowSeconds: 3600 },
  // A day's cap too (security review TR1): no one's WhatsApp is flooded with codes, and Frrata's sender rating holds.
  signupCodePhoneDay: { action: 'signup_code:phone_day', max: 5, windowSeconds: 86400 },
  signupCodeUserDay: { action: 'signup_code:user_day', max: 8, windowSeconds: 86400 },
  signupCodeAll: { action: 'signup_code:all', max: 300, windowSeconds: 3600 },
  // Share cards drawn per shop (search and sharing S1·3): a drawn card is stored and cached, so this bounds misuse
  // (odd paths cannot reach it), not real sharing. Fails closed.
  ogRender: { action: 'og:render', max: 200, windowSeconds: 3600 },
  ogRenderIp: { action: 'og:render:ip', max: 60, windowSeconds: 3600 },
  // Video uploads (V1, security review 2026-11-09 finding 1): each start asks Mux for an upload URL (a bucket of 20 per
  // environment, shared by every shop) and can cost a month's storage; per member, and for all of Frrata. Fail closed.
  // The per-shop day and month caps count the shop's own videos rows (src/lib/queries/videos.ts).
  videoStartMember: { action: 'video_start:member', max: 10, windowSeconds: 600 },
  videoStartAll: { action: 'video_start:all', max: 200, windowSeconds: 3600 },
  // Product videos (PV·1): their own keys, so a shop's product uploads never use up the Look's (impact review 2026-11-10).
  productVideoStartMember: { action: 'product_video_start:member', max: 10, windowSeconds: 600 },
  productVideoStartAll: { action: 'product_video_start:all', max: 200, windowSeconds: 3600 },
  // EkCode (P1; security review): starting a sign-in from a shop (per network); every ekcode.in API call (per network);
  // a proof-of-work nonce is used once. All fail closed: a code costs Frrata a message.
  ekStartIp: { action: 'ek_start:ip', max: 30, windowSeconds: 600 },
  ekApiIp: { action: 'ek_api:ip', max: 120, windowSeconds: 600 },
  ekPowNonce: { action: 'ek_pow:nonce', max: 1, windowSeconds: 900 },
  ekShopMeIp: { action: 'ek_me:ip', max: 120, windowSeconds: 600 },
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
