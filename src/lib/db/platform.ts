import 'server-only'
import { sql } from 'drizzle-orm'
import { db } from './index'
import { shopSlugFromHost } from '@/domains/tenancy/host'
import { SHOP_DOMAIN } from '@/lib/public-env'
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
 * change; any other host is a merchant's own domain (tenant_domains).
 */
export async function tenantForHost(host: string): Promise<{ id: string; name: string } | null> {
  const slug = shopSlugFromHost(host, SHOP_DOMAIN)
  const rows = slug
    ? await db().execute<{ id: string; name: string }>(sql`select id, name from app_tenant_for_slug(${slug})`)
    : await db().execute<{ id: string; name: string }>(sql`select id, name from app_tenant_for_host(${host})`)
  return rows[0] ?? null
}

export type Membership = {
  tenantId: string
  tenantName: string
  role: MemberRole
  /** Set when this access is a Frrata support visit, not a membership. */
  supportSessionId: string | null
}

export type Access = { staffRole: StaffRole | null; memberships: Membership[] }

export async function accessFor(userId: string): Promise<Access> {
  const rows = await db().execute<{ a: Access }>(sql`select app_access_for(${userId}::uuid) as a`)
  const a = rows[0]?.a
  return { staffRole: a?.staffRole ?? null, memberships: a?.memberships ?? [] }
}

/** Turns this user's open invites into memberships. Returns how many. */
export async function claimInvites(userId: string): Promise<number> {
  const rows = await db().execute<{ n: number }>(sql`select app_claim_invites(${userId}::uuid) as n`)
  return Number(rows[0]?.n ?? 0)
}

// ── Sign-up (Phase 1): before the shop exists ────────────────────────────────

export async function slugAvailable(slug: string): Promise<boolean> {
  const rows = await db().execute<{ ok: boolean }>(sql`select app_slug_available(${slug}) as ok`)
  return rows[0]?.ok === true
}

/** India Post reference data: the same for every shop. */
export async function placeForPincode(pincode: string): Promise<{ city: string; state: string } | null> {
  const rows = await db().execute<{ city: string; state: string }>(sql`select city, state from pincodes where pincode = ${pincode}`)
  return rows[0] ?? null
}

export type CreateShopError = 'email_unconfirmed' | 'has_shop' | 'bad_name' | 'bad_slug' | 'bad_pincode' | 'slug_taken' | 'no_launch_plan'
const CREATE_SHOP_ERRORS: readonly string[] = ['email_unconfirmed', 'has_shop', 'bad_name', 'bad_slug', 'bad_pincode', 'slug_taken', 'no_launch_plan']

/**
 * app_create_shop: `uid` must come from requireUser() (getUser), never from input.
 * `sells` must already be checked against SELLS: it is sent as one array literal
 * (drizzle would expand a JS array into a list of parameters).
 */
export async function createShop(p: { uid: string; name: string; slug: string; pickup: string; sells: string[] }):
  Promise<{ ok: true; tenantId: string } | { ok: false; error: CreateShopError | 'unknown' }> {
  try {
    const rows = await db().execute<{ id: string }>(
      sql`select app_create_shop(${p.uid}::uuid, ${p.name}, ${p.slug}, ${p.pickup}, ${`{${p.sells.join(',')}}`}::text[]) as id`,
    )
    return { ok: true, tenantId: rows[0]!.id }
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
    const code = ['not_owner', 'published', 'bad_slug', 'slug_taken'].find((c) => msg.includes(c))
    if (!code) console.error('[changeShopAddress]', errName(err))
    return { ok: false, error: code ?? 'unknown' }
  }
}

/** A Razorpay webhook's shop and its (encrypted) secret, from the key in its URL: before any tenant is known. */
export async function paymentWebhookFor(key: string): Promise<{ tenantId: string; secretEnc: string } | null> {
  if (!/^k_[a-f0-9]{32}$/.test(key)) return null
  const rows = await db().execute<{ tenant_id: string; webhook_secret_enc: string }>(sql`select tenant_id, webhook_secret_enc from app_payment_webhook_for(${key})`)
  return rows[0] ? { tenantId: rows[0].tenant_id, secretEnc: rows[0].webhook_secret_enc } : null
}

/** Shops with a provider's events still to process (the daily safety net; read with no tenant set, which the policy allows). */
export async function shopsWithPendingEvents(provider: 'razorpay' | 'whatsapp' = 'razorpay'): Promise<string[]> {
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
