import 'server-only'
import { sql } from 'drizzle-orm'
import { db } from './index'
import { shopSlugFromHost } from '@/domains/tenancy/host'
import { SHOP_DOMAIN } from '@/lib/public-env'
import type { MemberRole, StaffRole } from './schema'

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
  /** Set when this access is a Frata support visit, not a membership. */
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
    if (!code) console.error('[createShop]', msg)
    return { ok: false, error: (code as CreateShopError | undefined) ?? 'unknown' }
  }
}

// ── The Frata website: the public price list (plans are readable by frata_app) ─

export type PublicPlan = { code: string; name: string; monthlyPrice: number; includedOrders: number; feeBps: number; features: string[] }

/** The newest version of each plan, in plan order. The homepage reads prices here, never from its own copy. */
export async function publicPlans(): Promise<PublicPlan[]> {
  const rows = await db().execute<{ code: string; name: string; monthly_price: string; included_orders: number; fee_bps: number; features: string[] }>(sql`
    select distinct on (p.position) p.code, p.name, v.monthly_price, v.included_orders, v.fee_bps, v.features
    from plans p join plan_versions v on v.plan_id = p.id
    order by p.position, v.version desc`)
  return rows.map((r) => ({ code: r.code, name: r.name, monthlyPrice: Number(r.monthly_price), includedOrders: r.included_orders, feeBps: r.fee_bps, features: r.features }))
}
