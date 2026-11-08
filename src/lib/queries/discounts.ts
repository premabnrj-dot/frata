import 'server-only'
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { offerStatus, type OfferStatus } from '@/domains/checkout/offer-status'
import type { DiscountStyle } from '@/domains/checkout/discounts'
import { paise } from '@/domains/money/paise'
import { orderProfit } from '@/domains/orders/profit'
import { deliveredFee } from '@/domains/plans/entitlements'
import { planVersions, tenantPlans } from '@/lib/db/schema'
import { discountCodes, discountTargets, discountTiers, discounts, orderDiscounts } from '@/lib/db/schema-discounts'
import { collections, products, variants } from '@/lib/db/schema-catalogue'
import { orders } from '@/lib/db/schema-orders'
import { discountUses, useOfRowSql } from '@/lib/db/discount-predicates'
import { standingSql } from '@/lib/db/order-predicates'
import { withTenant } from '@/lib/db/tenant'

// =============================================================================
// FILE: src/lib/queries/discounts.ts
//
// THE CONSOLE'S OFFERS (docs/specs/2026-11-08-coupons.md § Console). Merchant data: never imported by a
// shopper's route (the shopper's read is liveOffers in checkout.ts). Status is derived (offer-status.ts);
// uses, ₹ given and ₹ kept are derived from order_discounts and order state (discountUses), never stored.
// `useCount` and `budgetLeft` are server-only names (check-client-bundle sentinels): pages render them.
// =============================================================================

export type OfferRow = {
  id: string; title: string; style: DiscountStyle; percentBps: number | null; amountOff: number | null; cap: number | null; minSubtotal: number
  limitTotal: number | null; limitPerPhone: number | null; budget: number | null
  startsAt: Date; endsAt: Date | null; startedAt: Date | null; pausedAt: Date | null; endedAt: Date | null
  listed: boolean; combinesWithPayment: boolean; announce: boolean; code: string | null; createdAt: Date
  status: OfferStatus
  /** Orders using it now (abandoned and cancelled ones gave theirs back). */
  useCount: number
  /** ₹ it gave on those orders. */
  given: number
  budgetLeft: number | null
  delivered: number
  /** Profit kept per delivered order that used it (profit.ts), or null before any delivery. */
  keptPerDelivered: number | null
  // O·2 terms
  targets: 'all' | 'products' | 'collections'; targetIds: string[]
  buyQty: number | null; getQty: number | null; getBps: number | null; giftVariantId: string | null; firstOrder: boolean
  tiers: { min: number; percentBps: number | null; amountOff: number | null }[]
  /** Creator codes, each with its own uses and ₹ given (O·3 judges them on delivered orders). */
  creators: { id: string; label: string; code: string; useCount: number; given: number }[]
}

const n = (v: unknown) => (v == null ? null : Number(v))

/** Every offer (newest 200), or just `onlyId` (an offer page: never missed because it is older than the newest 200). */
export async function listOffers(tenantId: string, now = new Date(), onlyId?: string): Promise<OfferRow[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.select({
      id: discounts.id, title: discounts.title, style: discounts.style, percentBps: discounts.percentBps, amountOff: discounts.amountOff, cap: discounts.cap, minSubtotal: discounts.minSubtotal,
      limitTotal: discounts.limitTotal, limitPerPhone: discounts.limitPerPhone, budget: discounts.budget, startsAt: discounts.startsAt, endsAt: discounts.endsAt,
      startedAt: discounts.startedAt, pausedAt: discounts.pausedAt, endedAt: discounts.endedAt, listed: discounts.listed, combinesWithPayment: discounts.combinesWithPayment,
      announce: discounts.announce, createdAt: discounts.createdAt, code: discountCodes.code,
      targets: discounts.targets, buyQty: discounts.buyQty, getQty: discounts.getQty, getBps: discounts.getBps, giftVariantId: discounts.giftVariantId, firstOrder: discounts.firstOrder,
    }).from(discounts).leftJoin(discountCodes, and(eq(discountCodes.tenantId, discounts.tenantId), eq(discountCodes.discountId, discounts.id), isNull(discountCodes.label)))
      .where(onlyId ? and(eq(discounts.tenantId, tenantId), eq(discounts.id, onlyId)) : eq(discounts.tenantId, tenantId)).orderBy(desc(discounts.createdAt)).limit(200)
    if (!rows.length) return []
    // Uses and ₹ given, as the orders stand now; delivered orders with what profit.ts needs.
    const byId = await discountUses(tx, tenantId, rows.map((r) => r.id), now)
    const fee = await feeBpsNow(tenantId, now)
    const delivered = await tx.execute<{ id: string; net: string; cogs: string | null; fwd: string; gw: string | null; base: string }>(sql`
      select distinct od.discount_id id, o.id oid, o.net_revenue net, o.cogs, o.forward_shipping fwd, o.gateway_fee gw, o.merchandise_net base from ${orderDiscounts} od
        join ${orders} o on o.tenant_id = od.tenant_id and o.id = od.order_id
       where od.tenant_id = ${tenantId} and o.delivered_at is not null and o.rto_initiated_at is null and od.class <> 'shipping'`)
    const ids = rows.map((r) => r.id)
    const [targets, tiers, creators] = await Promise.all([
      tx.select({ discountId: discountTargets.discountId, productId: discountTargets.productId, collectionId: discountTargets.collectionId }).from(discountTargets)
        .where(and(eq(discountTargets.tenantId, tenantId), inArray(discountTargets.discountId, ids))),
      tx.select({ discountId: discountTiers.discountId, min: discountTiers.minSubtotal, percentBps: discountTiers.percentBps, amountOff: discountTiers.amountOff }).from(discountTiers)
        .where(and(eq(discountTiers.tenantId, tenantId), inArray(discountTiers.discountId, ids))).orderBy(asc(discountTiers.minSubtotal)),
      tx.select({ id: discountCodes.id, discountId: discountCodes.discountId, label: discountCodes.label, code: discountCodes.code }).from(discountCodes)
        .where(and(eq(discountCodes.tenantId, tenantId), inArray(discountCodes.discountId, ids), isNotNull(discountCodes.label))).orderBy(asc(discountCodes.createdAt)),
    ])
    // A creator code's own uses and ₹ given: the same use rule, counted by code.
    const byCode = creators.length ? new Map((await tx.execute<{ id: string; n: number; given: string }>(sql`
      select od.code_id id, count(*)::int n, coalesce(sum(od.amount), 0)::bigint given from ${orderDiscounts} od join ${orders} o on o.tenant_id = od.tenant_id and o.id = od.order_id
       where od.tenant_id = ${tenantId} and od.code_id in ${creators.map((c) => c.id)} and ${useOfRowSql(now)} group by od.code_id`)).map((x) => [x.id, x])) : new Map()
    return rows.map((r) => {
      const u = byId.get(r.id)
      const given = Number(u?.given ?? 0)
      const mine = delivered.filter((d) => d.id === r.id)
      // ₹ kept per delivered order: profit.ts on what was stored. Unknown costs (cogs not set) leave it unknown.
      const known = mine.filter((d) => d.cogs !== null)
      const kept = known.length && fee !== null ? Math.round(known.reduce((a, d) => a + orderProfit({
        netRevenue: paise(Number(d.net)), cogs: paise(Number(d.cogs)), forwardShipping: paise(Number(d.fwd)), rtoShipping: paise(0), codFee: paise(0),
        gatewayFee: paise(Number(d.gw ?? 0)), packaging: paise(0), adCost: paise(0), platformFee: deliveredFee(paise(Number(d.base)), fee),
      }, 1).ifDelivered, 0) / known.length) : null
      const budget = n(r.budget)
      return {
        ...r, style: r.style as DiscountStyle, amountOff: n(r.amountOff), cap: n(r.cap), minSubtotal: Number(r.minSubtotal), budget,
        code: r.code ? r.code.toUpperCase() : null, status: offerStatus(r, now), useCount: u?.n ?? 0, given,
        budgetLeft: budget === null ? null : Math.max(0, budget - given), delivered: mine.length, keptPerDelivered: kept,
        targets: r.targets as OfferRow['targets'], targetIds: targets.filter((t) => t.discountId === r.id).map((t) => (t.productId ?? t.collectionId)!),
        tiers: tiers.filter((t) => t.discountId === r.id).map((t) => ({ min: Number(t.min), percentBps: t.percentBps, amountOff: n(t.amountOff) })),
        creators: creators.filter((c) => c.discountId === r.id).map((c) => ({ id: c.id, label: c.label!, code: c.code.toUpperCase(), useCount: byCode.get(c.id)?.n ?? 0, given: Number(byCode.get(c.id)?.given ?? 0) })),
      }
    })
  })
}

/** The fee on a delivered order under the shop's current plan, in bps (null without a plan). */
async function feeBpsNow(tenantId: string, now: Date): Promise<number | null> {
  return withTenant(tenantId, async (tx) => {
    const [p] = await tx.select({ fee: planVersions.feeBps }).from(tenantPlans).innerJoin(planVersions, eq(planVersions.id, tenantPlans.planVersionId))
      .where(and(eq(tenantPlans.tenantId, tenantId), sql`${tenantPlans.startsAt} <= ${now.toISOString()}::timestamptz`)).orderBy(desc(tenantPlans.startsAt)).limit(1)
    return p ? p.fee : null
  })
}

/**
 * Who would get an order offer anyway: of the last 30 days' standing orders, the share already at or above
 * `minSubtotal`, and roughly what the offer would have given them (spec § Console: "62% already qualify").
 */
export async function alreadyQualify(tenantId: string, o: { minSubtotal: number; percentBps: number | null; amountOff: number | null; cap: number | null }, now = new Date()) {
  return withTenant(tenantId, async (tx) => {
    const since = new Date(now.getTime() - 30 * 86_400_000).toISOString()
    const pct = o.percentBps ?? 0, amt = o.amountOff ?? 0, cap = o.cap ?? 9_000_000_000_000
    const [r] = await tx.execute<{ total: number; qualify: number; would: string }>(sql`
      select count(*)::int total, (count(*) filter (where o.subtotal >= ${o.minSubtotal}))::int qualify,
             coalesce(sum(case when o.subtotal >= ${o.minSubtotal} then least(${cap}::bigint, o.subtotal, case when ${pct} > 0 then floor(o.subtotal * ${pct} / 10000) else ${amt} end) else 0 end), 0)::bigint would
        from ${orders} o where o.tenant_id = ${tenantId} and o.placed_at >= ${since}::timestamptz and ${standingSql('o')}`)
    return { orders: r?.total ?? 0, qualify: r?.qualify ?? 0, would: Number(r?.would ?? 0) }
  })
}

/** What the offer form picks from: the shop's products, collections and sellable pieces (for a gift). Names only. */
export async function offerPickers(tenantId: string) {
  return withTenant(tenantId, async (tx) => {
    const [ps, cs, vs] = await Promise.all([
      tx.select({ id: products.id, title: products.title }).from(products).where(and(eq(products.tenantId, tenantId), sql`${products.status} <> 'archived'`)).orderBy(asc(products.title)).limit(1000),
      tx.select({ id: collections.id, title: collections.title }).from(collections).where(eq(collections.tenantId, tenantId)).orderBy(asc(collections.title)),
      tx.select({ id: variants.id, title: products.title, values: variants.optionValues }).from(variants)
        .innerJoin(products, and(eq(products.tenantId, variants.tenantId), eq(products.id, variants.productId)))
        .where(and(eq(variants.tenantId, tenantId), isNull(variants.archivedAt), sql`${products.status} <> 'archived'`)).orderBy(asc(products.title)).limit(2000),
    ])
    return { products: ps, collections: cs, pieces: vs.map((v) => ({ id: v.id, title: [v.title, ...(v.values ?? [])].join(' · ') })) }
  })
}
