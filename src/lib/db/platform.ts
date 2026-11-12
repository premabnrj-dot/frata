import 'server-only'
import { sql } from 'drizzle-orm'
import { db, withFreshPool } from './index'
import type { ClaimKey } from '@/lib/trials/claims'
import { shopSlugFromHost } from '@/domains/tenancy/host'
import { SHOP_DOMAIN, shopHost } from '@/lib/public-env'
import type { MemberRole, StaffRole } from './schema'
import { errName } from '@/lib/log'

// =============================================================================
// FILE: src/lib/db/platform.ts
//
// THE QUESTIONS ASKED BEFORE A TENANT IS KNOWN, and nothing else — each a
// SECURITY DEFINER function (drizzle/0001, 0006) returning only its answer:
//   - which tenant does this storefront host belong to?
//   - who is this user: staff role, and which stores (memberships and live
//     support sessions) may they open?
//   - claim this user's invites (confirmed email only).
// =============================================================================

/**
 * Which shop a storefront host belongs to. A platform address (<slug>.<shop
 * domain>) is found by its slug, so changing the shop domain is an environment
 * change; any other host is a merchant's own domain (shop_domains; tenant_domains is retired, app_tenant_for_host
 * goes in a later migration).
 */
export async function tenantForHost(host: string): Promise<{ id: string; name: string; movedTo: string | null } | null> {
  const slug = shopSlugFromHost(host, SHOP_DOMAIN)
  if (!slug) {
    // Own domains D2·6: a proved host on our project (shop_domains). www.<host> never reaches here: Vercel sends it on.
    const rows = await db().execute<{ id: string; name: string }>(sql`select id, name from app_shop_for_domain(${host})`)
    return rows[0] ? { ...rows[0], movedTo: null } : null
  }
  // Any name the shop has had (shop addresses D·1): an old one leads to the current; one Frrata retired leads nowhere.
  const rows = await db().execute<{ id: string; name: string; current_name: string; retired: boolean; retired_by_frrata: boolean }>(
    sql`select id, name, current_name, retired, retired_by_frrata from app_shop_for_name(${slug})`)
  const r = rows[0]
  if (!r || r.retired_by_frrata) return null
  return { id: r.id, name: r.name, movedTo: r.retired ? shopHost(r.current_name) : null }
}

export type Membership = {
  tenantId: string
  tenantName: string
  role: MemberRole
  /** Set when this access is a Frrata support visit, not a membership. */
  supportSessionId: string | null
}

/** `staffConfirmedAt`: when this browser session's live passkey step-up was made (null without one). */
export type Access = { staffRole: StaffRole | null; staffConfirmedAt: string | null; memberships: Membership[] }

export async function accessFor(userId: string, sessionId: string | null = null, stepupHash: string | null = null): Promise<Access> {
  // The first query of every signed-in request: if its pooled connection is lost, a fresh pool answers instead of the
  // request waiting to Vercel's 60 s (src/lib/db/index.ts withFreshPool; 2026-11-11).
  const rows = await withFreshPool(() => db().execute<{ a: Access }>(sql`select app_access_for(${userId}::uuid, ${sessionId}::uuid, ${stepupHash}::text) as a`))
  const a = rows[0]?.a
  return { staffRole: a?.staffRole ?? null, staffConfirmedAt: a?.staffConfirmedAt ?? null, memberships: a?.memberships ?? [] }
}

/** Sign-out ends this browser's staff step-up first (by its cookie's hash). */
export async function endStaffStepup(hash: string): Promise<void> {
  await db().execute(sql`select app_staff_signout(${hash})`)
}

/** Turns this user's open invites into memberships. Returns how many. */
export async function claimInvites(userId: string): Promise<number> {
  const rows = await db().execute<{ n: number }>(sql`select app_claim_invites(${userId}::uuid) as n`)
  return Number(rows[0]?.n ?? 0)
}

// ── Sign-up (Phase 1): before the shop exists ────────────────────────────────

/** Free or not: a name ever used by any shop, or blocked by Frrata, is "taken" (the reason is never told). */
export async function slugAvailable(slug: string): Promise<boolean> {
  const rows = await db().execute<{ r: string }>(sql`select app_name_check(${slug}) as r`)
  return rows[0]?.r === 'ok'
}

/** India Post reference data: the same for every shop. */
export async function placeForPincode(pincode: string): Promise<{ city: string; state: string } | null> {
  const rows = await db().execute<{ city: string; state: string }>(sql`select city, state from pincodes where pincode = ${pincode}`)
  return rows[0] ?? null
}

/** Every PIN code in India Post's directory, the same for every shop (cached once a day: storefront.ts directoryPins). */
export async function allPincodes(): Promise<string[]> {
  const rows = await db().execute<{ pincode: string }>(sql`select pincode from pincodes order by pincode`)
  return rows.map((r) => r.pincode)
}

export type CreateShopError = 'email_unconfirmed' | 'has_shop' | 'bad_name' | 'bad_slug' | 'bad_pincode' | 'slug_taken' | 'no_launch_plan' | 'bad_plan' | 'bad_code'
const CREATE_SHOP_ERRORS: readonly string[] = ['email_unconfirmed', 'has_shop', 'bad_name', 'bad_slug', 'bad_pincode', 'slug_taken', 'no_launch_plan', 'bad_plan', 'bad_code']

/**
 * app_create_shop: `uid` must come from requireUser() (getUser), never from input.
 * `sells` must already be checked against SELLS: it is sent as one array literal
 * (drizzle would expand a JS array into a list of parameters).
 */
export async function createShop(p: { uid: string; name: string; slug: string; pickup: string; sells: string[]; plan: string; email: ClaimKey | null; codeId: string | null }):
  Promise<{ ok: true; tenantId: string; trial: boolean } | { ok: false; error: CreateShopError | 'unknown' }> {
  try {
    // Trials TR1 (drizzle/0065): the chosen plan, and a trial when no verified key has had one. The email key is the
    // HMAC of getUser()'s email (src/lib/trials/claims.ts); the phone comes only from a code this person verified.
    const rows = await db().execute<{ tenant_id: string; trial: boolean }>(
      sql`select * from app_create_shop_v2(${p.uid}::uuid, ${p.name}, ${p.slug}, ${p.pickup}, ${`{${p.sells.join(',')}}`}::text[], ${p.plan},
        ${p.email?.hmac ?? null}, ${p.email?.version ?? 1}::smallint, ${p.codeId}::uuid)`,
    )
    return { ok: true, tenantId: rows[0]!.tenant_id, trial: !!rows[0]!.trial }
  } catch (err) {
    const msg = (err as { cause?: { message?: string } })?.cause?.message ?? (err instanceof Error ? err.message : '')
    const code = CREATE_SHOP_ERRORS.find((c) => msg.includes(c))
    if (!code) console.error('[createShop]', errName(err))
    return { ok: false, error: (code as CreateShopError | undefined) ?? 'unknown' }
  }
}

// ── The Frrata website: the public price list (plans are readable by frata_app) ─

export type PublicPlan = { code: string; name: string; monthlyPrice: number; includedOrders: number; feeBps: number; features: string[] }

/** The newest version of each plan, in plan order. The homepage reads prices here, never from its own copy. */
export async function publicPlans(): Promise<PublicPlan[]> {
  const rows = await db().execute<{ code: string; name: string; monthly_price: string; included_orders: number; fee_bps: number; features: string[] }>(sql`
    select distinct on (p.position) p.code, p.name, v.monthly_price, v.included_orders, v.fee_bps, v.features
    from plans p join plan_versions v on v.plan_id = p.id
    order by p.position, v.version desc`)
  return rows.map((r) => ({ code: r.code, name: r.name, monthlyPrice: Number(r.monthly_price), includedOrders: r.included_orders, feeBps: r.fee_bps, features: r.features }))
}

/**
 * The theme versions Frrata has decided about (themes T3): platform data the shop reads to know which versions it
 * may use and which are withdrawn. Only the columns shops may read (never who or why).
 */
export async function themeVersionRows(): Promise<{ id: string; themeKey: string; version: string; releasedAt: Date | null; recalledAt: Date | null; withdrawnAt: Date | null }[]> {
  const rows = await db().execute<{ id: string; theme_key: string; version: string; released_at: string | null; recalled_at: string | null; withdrawn_at: string | null }>(sql`
    select id, theme_key, version, released_at, recalled_at, withdrawn_at from theme_versions`)
  const d = (x: string | null) => (x ? new Date(x) : null)
  return rows.map((r) => ({ id: r.id, themeKey: r.theme_key, version: r.version, releasedAt: d(r.released_at), recalledAt: d(r.recalled_at), withdrawnAt: d(r.withdrawn_at) }))
}

/** app_change_shop_address: the tenant from requireMember, the uid from getUser(); the function re-checks both. */
export async function changeShopAddress(tenantId: string, uid: string, slug: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await db().execute(sql`select app_change_shop_address(${tenantId}::uuid, ${uid}::uuid, ${slug})`)
    return { ok: true }
  } catch (err) {
    const msg = (err as { cause?: { message?: string } })?.cause?.message ?? (err instanceof Error ? err.message : '')
    const code = ['not_owner', 'frozen', 'no_renames_left', 'needs_razorpay', 'bad_slug', 'slug_taken'].find((c) => msg.includes(c))
    if (!code) console.error('[changeShopAddress]', errName(err))
    return { ok: false, error: code ?? 'unknown' }
  }
}

/** D1·9: added names past their 14 days, let go across shops (the daily sweep); their names, for the host lookups. */
export async function letGoAddedNames(): Promise<string[]> {
  const rows = await db().execute<{ n: string }>(sql`select n from app_let_go_added_names() as n`)
  return rows.map((r) => r.n)
}

/** Own domains D2·8: rows due a check, across shops (ids only; each is checked in its own shop's transaction). */
export async function domainsDue(limit: number): Promise<{ tenantId: string; id: string; parked: boolean }[]> {
  const rows = await db().execute<{ tenant_id: string; id: string; parked: boolean }>(sql`select tenant_id, id, parked from app_domains_due(${limit})`)
  return rows.map((r) => ({ tenantId: r.tenant_id, id: r.id, parked: r.parked }))
}

/** Own domains D2·6: the claim (app_claim_domain checks who, the caps and the project's room; it makes the token). */
export async function claimDomainRow(tenantId: string, uid: string, f: { host: string; apex: string; withWww: boolean }, room: number): Promise<{ id: string; token: string }> {
  const [row] = await db().execute<{ id: string; token: string }>(
    sql`select c.id, c.token from app_claim_domain(${tenantId}::uuid, ${uid}::uuid, ${f.host}, ${f.apex}, ${f.withWww}, ${room}) c`)
  return row!
}

/** A Razorpay webhook's shop and its (encrypted) secret, from the key in its URL: before any tenant is known. */
export async function paymentWebhookFor(key: string): Promise<{ tenantId: string; secretEnc: string } | null> {
  if (!/^k_[a-f0-9]{32}$/.test(key)) return null
  const rows = await db().execute<{ tenant_id: string; webhook_secret_enc: string }>(sql`select tenant_id, webhook_secret_enc from app_payment_webhook_for(${key})`)
  return rows[0] ? { tenantId: rows[0].tenant_id, secretEnc: rows[0].webhook_secret_enc } : null
}

/** Shops with a provider's events still to process (the daily safety net; read with no tenant set, which the policy allows). */
export async function shopsWithPendingEvents(provider: 'razorpay' | 'whatsapp' | 'mux' = 'razorpay'): Promise<string[]> {
  const rows = await db().execute<{ t: string }>(sql`select t from app_pending_event_shops(${provider}) as t`)
  return rows.map((r) => r.t)
}

/** Shops with abandoned online orders past the cutoff whose shopper details are still there: ids only (drizzle/0021). */
export async function shopsToErase(before: Date): Promise<string[]> {
  const rows = await db().execute<{ id: string }>(sql`select app_shops_to_erase(${before.toISOString()}::timestamptz) as id`)
  return rows.map((r) => r.id)
}

// ── Messages (WhatsApp, drizzle/0030) ──────────────────────────────────────────
/** Stores one verified WhatsApp item for the shop whose open connection has this id, under OUR key
 *  "whatsapp:<shop>:<tail>". The definer finds the shop; returns it when a new row landed (null: no shop, or a retry). */
/** A Mux event, routed by the definer (drizzle/0081): our row id AND the row's upload id, or a rendition's asset id
 *  already on a row, in the same environment. The shop, or null (nothing matched, or stored before). */
export async function storeMuxEvent(f: { env: string; eventId: string; type: string; video: string | null; uploadId: string | null; assetId: string | null; status: string | null }): Promise<string | null> {
  const rows = await db().execute<{ t: string | null }>(sql`select app_store_mux_event(${f.env}, ${f.eventId}, ${f.type}, ${f.video}::uuid, ${f.uploadId}, ${f.assetId}, ${f.status}) as t`)
  return rows[0]?.t ?? null
}

export async function storeWhatsAppEvent(by: 'number' | 'account', metaId: string, tail: string, payload: object): Promise<string | null> {
  const rows = await db().execute<{ t: string | null }>(sql`select app_store_wa_event(${by}, ${metaId}, ${tail}, ${JSON.stringify(payload)}::jsonb) as t`)
  return rows[0]?.t ?? null
}

/**
 * The plans for a public page (website spec W·1): none while the site is being built without a database, so the
 * page shows its fallback; at runtime a failure THROWS, so the last good cached page stays instead of an hour of
 * "no prices".
 */
export async function publicPlansForPage(page: string): Promise<PublicPlan[]> {
  try { return await publicPlans() } catch (err) {
    // NEXT_PHASE is set by Next itself while it builds (next/constants PHASE_PRODUCTION_BUILD).
    if (process.env.NEXT_PHASE === 'phase-production-build') return []
    console.error(`[${page}] plans`, err instanceof Error ? err.name : 'error'); throw err
  }
}

// ── Billing (drizzle/0048) ─────────────────────────────────────────────────────
/** Shops whose plan began before `before` (the end of the month being drafted): ids only. */
export async function shopsToBill(before: Date): Promise<string[]> {
  const rows = await db().execute<{ id: string }>(sql`select app_shops_to_bill(${before.toISOString()}::timestamptz) as id`)
  return rows.map((r) => r.id)
}

// ── Billing B3: autopay, the system's side (drizzle/0057). Definers; no shop set. ───────────────────────────────
export type BillingDue = { tenantId: string; invoiceId: string; number: string; due: number; testMode: boolean; issuedAt: Date; mandate: boolean; mandateMax: number | null
  mandateMethod: string | null; noticeAt: Date | null; attempts: number; pending: number; lastFailedAt: Date | null; acknowledged: boolean; trialEndsAt: Date | null }
export async function billingDue(): Promise<BillingDue[]> {
  const rows = await db().execute<Record<string, unknown>>(sql`select * from app_billing_due()`)
  const d = (v: unknown) => (v ? new Date(v as string) : null)
  return rows.map((r) => ({ tenantId: r.tenant_id as string, invoiceId: r.invoice_id as string, number: r.number as string, due: Number(r.due), testMode: !!r.test_mode, issuedAt: new Date(r.issued_at as string),
    mandate: !!r.mandate, mandateMax: r.mandate_max == null ? null : Number(r.mandate_max), mandateMethod: (r.mandate_method as string) ?? null, noticeAt: d(r.notice_at),
    attempts: Number(r.attempts), pending: Number(r.pending), lastFailedAt: d(r.last_failed_at), acknowledged: !!r.acknowledged, trialEndsAt: d(r.trial_ends_at) }))
}
export async function billingNotice(invoiceId: string, kind: 'debit_notice' | 'failed' | 'acknowledge', amount: number, debitAt: Date | null) {
  await db().execute(sql`select app_billing_notice(${invoiceId}::uuid, ${kind}, ${amount}, ${debitAt ? debitAt.toISOString() : null}::timestamptz)`)
}
/** One attempt's payment row and outbox row, together; null when another attempt is unsettled or nothing can be taken. */
export async function beginBillingAttempt(invoiceId: string, attempt: number): Promise<string | null> {
  const [r] = await db().execute<{ id: string | null }>(sql`select app_billing_begin_attempt(${invoiceId}::uuid, ${attempt}) as id`)
  return r?.id ?? null
}
/** One unsettled debit: `due` is what the invoice owes NOW; `claimed`, whether a sender has taken it already. */
export type AttemptContext = { tenantId: string; amount: number; receipt: string; gatewayOrderId: string | null; customer: string | null; token: string | null; testMode: boolean; due: number; claimed: boolean }
export async function billingAttemptContext(paymentId: string): Promise<AttemptContext | null> {
  const [r] = await db().execute<Record<string, unknown>>(sql`select * from app_billing_attempt_context(${paymentId}::uuid)`)
  return r ? { tenantId: r.tenant_id as string, amount: Number(r.amount), receipt: r.receipt as string, gatewayOrderId: (r.gateway_order_id as string) ?? null, customer: (r.customer as string) ?? null, token: (r.token as string) ?? null, testMode: !!r.test_mode, due: Number(r.due), claimed: !!r.claimed } : null
}
/** Takes the attempt for this sender, once (drizzle/0060). False: someone has it; charge nothing. */
export async function claimBillingAttempt(paymentId: string): Promise<boolean> {
  const [r] = await db().execute<{ ok: boolean }>(sql`select app_billing_attempt_claim(${paymentId}::uuid) as ok`)
  return !!r?.ok
}
/** Closes an attempt that charged nothing (stale, or never reached the gateway); the next run sends a fresh notice. */
export async function closeBillingAttempt(paymentId: string, reason: string): Promise<boolean> {
  const [r] = await db().execute<{ ok: boolean }>(sql`select app_billing_attempt_close(${paymentId}::uuid, ${reason}) as ok`)
  return !!r?.ok
}
/** Webhook events stored but never applied after `olderMinutes` (an after() that failed). */
export async function billingUnapplied(olderMinutes: number): Promise<string[]> {
  const rows = await db().execute<{ id: string }>(sql`select app_billing_unapplied(make_interval(mins => ${olderMinutes})) as id`)
  return rows.map((r) => r.id)
}
export async function billingAttemptOrder(paymentId: string, order: string) {
  await db().execute(sql`select app_billing_attempt_order(${paymentId}::uuid, ${order})`)
}
export async function billingAttemptResult(order: string, paymentId: string | null, captured: boolean, reason: string | null): Promise<boolean> {
  const [r] = await db().execute<{ ok: boolean }>(sql`select app_billing_attempt_result(${order}, ${paymentId}, ${captured}, ${reason}) as ok`)
  return !!r?.ok
}
/** Frrata's billing webhook: stored once under the gateway's event id (null: already stored), then applied from the row. */
export async function storeBillingEvent(eventId: string, type: string, payload: object): Promise<string | null> {
  const [r] = await db().execute<{ id: string | null }>(sql`select app_store_billing_event(${eventId}, ${type}, ${JSON.stringify(payload)}::jsonb) as id`)
  return r?.id ?? null
}
export async function applyBillingEvent(id: string) {
  await db().execute(sql`select app_apply_billing_event(${id}::uuid)`)
}
/** Attempts still unsettled after `olderMinutes`: ids and their gateway orders (null: it never reached the gateway). */
export async function billingUnsettled(olderMinutes: number): Promise<{ paymentId: string; order: string | null }[]> {
  const rows = await db().execute<{ payment_id: string; gateway_order_id: string | null }>(sql`select * from app_billing_unsettled(make_interval(mins => ${olderMinutes}))`)
  return rows.map((r) => ({ paymentId: r.payment_id, order: r.gateway_order_id }))
}

/** The trial terms new sign-ups get (platform data, trials TR1): the sign-up page names the length from here, never a copy. */
export async function signupTrialDays(): Promise<number> {
  const [r] = await db().execute<{ days: number }>(sql`select days from trial_settings where id = 1`)
  return r?.days ?? 30
}

// ── Trials TR1: sign-up codes (drizzle/0065; definers only, keyed HMACs only) ─────────────────────────────────────
export async function signupCodeIssue(uid: string, phoneHmac: string, codeHmac: string, version: number): Promise<string | null> {
  try {
    const [r] = await db().execute<{ id: string }>(sql`select app_signup_code_issue(${uid}::uuid, ${phoneHmac}, ${codeHmac}, ${version}::smallint) as id`)
    return r?.id ?? null
  } catch (err) { console.error('[signupCodeIssue]', errName(err)); return null }
}
export async function signupCodeVerify(uid: string, id: string, codeHmac: string): Promise<boolean> {
  try {
    const [r] = await db().execute<{ ok: boolean }>(sql`select app_signup_code_verify(${uid}::uuid, ${id}::uuid, ${codeHmac}) as ok`)
    return !!r?.ok
  } catch (err) { console.error('[signupCodeVerify]', errName(err)); return false }
}
