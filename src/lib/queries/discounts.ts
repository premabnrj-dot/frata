import 'server-only'
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { offerStatus, type OfferStatus } from '@/domains/checkout/offer-status'
import type { DiscountStyle } from '@/domains/checkout/discounts'
import { paise } from '@/domains/money/paise'
import { freightOf, type FreightSource } from '@/domains/orders/freight'
import { orderProfit } from '@/domains/orders/profit'
import { feeForOrder } from '@/domains/plans/entitlements'
import { planVersions, tenantPlans } from '@/lib/db/schema'
import { estimateOf } from '@/domains/settings/ship-costs'
import { shipCostsIn } from '@/lib/queries/settings'
import { discountCodes, discountTargets, discountTiers, discounts, orderDiscounts } from '@/lib/db/schema-discounts'
import { collections, products, variants } from '@/lib/db/schema-catalogue'
import { orders } from '@/lib/db/schema-orders'
import { discountUses, useOfRowSql } from '@/lib/db/discount-predicates'
import { billableAtSql, currentMethodSql, holdingSql, openShipmentProviderSql, priorOrderSql, standingSql, stateSql } from '@/lib/db/order-predicates'
import { leakOf, type Leak } from '@/domains/checkout/leak'
import { withTenant } from '@/lib/db/tenant'
import type { Tx } from '@/lib/db'

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
  /** Stopped by Frrata (Admin's kill switch, O·4), and Frrata's reason, shown to the shop. */
  stoppedAt: Date | null; stopReason: string | null
  listed: boolean; combinesWithPayment: boolean; announce: boolean; code: string | null; createdAt: Date
  status: OfferStatus
  /** Orders using it now (abandoned and cancelled ones gave theirs back). */
  useCount: number
  /** ₹ it gave on those orders. */
  given: number
  budgetLeft: number | null
  // O·2 terms
  targets: 'all' | 'products' | 'collections'; targetIds: string[]
  buyQty: number | null; getQty: number | null; getBps: number | null; giftVariantId: string | null; firstOrder: boolean
  tiers: { min: number; percentBps: number | null; amountOff: number | null }[]
  /** Creator codes, each with its own uses and ₹ given, all time (offerStats judges them on the window's delivered orders). */
  creators: { id: string; label: string; code: string; useCount: number; given: number }[]
}

const n = (v: unknown) => (v == null ? null : Number(v))

/** Every offer (newest 200), or just `onlyId` (an offer page: never missed because it is older than the newest 200). */
export async function listOffers(tenantId: string, now = new Date(), onlyId?: string): Promise<OfferRow[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.select({
      id: discounts.id, title: discounts.title, style: discounts.style, percentBps: discounts.percentBps, amountOff: discounts.amountOff, cap: discounts.cap, minSubtotal: discounts.minSubtotal,
      limitTotal: discounts.limitTotal, limitPerPhone: discounts.limitPerPhone, budget: discounts.budget, startsAt: discounts.startsAt, endsAt: discounts.endsAt,
      startedAt: discounts.startedAt, pausedAt: discounts.pausedAt, endedAt: discounts.endedAt, stoppedAt: discounts.stoppedAt, stopReason: discounts.stopReason, listed: discounts.listed, combinesWithPayment: discounts.combinesWithPayment,
      announce: discounts.announce, createdAt: discounts.createdAt, code: discountCodes.code,
      targets: discounts.targets, buyQty: discounts.buyQty, getQty: discounts.getQty, getBps: discounts.getBps, giftVariantId: discounts.giftVariantId, firstOrder: discounts.firstOrder,
    }).from(discounts).leftJoin(discountCodes, and(eq(discountCodes.tenantId, discounts.tenantId), eq(discountCodes.discountId, discounts.id), isNull(discountCodes.label)))
      .where(onlyId ? and(eq(discounts.tenantId, tenantId), eq(discounts.id, onlyId)) : eq(discounts.tenantId, tenantId)).orderBy(desc(discounts.createdAt)).limit(200)
    if (!rows.length) return []
    // Uses and ₹ given, all time, as the orders stand now (limits and budgets read the same count).
    const byId = await discountUses(tx, tenantId, rows.map((r) => r.id), now)
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
      const budget = n(r.budget)
      return {
        ...r, style: r.style as DiscountStyle, amountOff: n(r.amountOff), cap: n(r.cap), minSubtotal: Number(r.minSubtotal), budget,
        code: r.code ? r.code.toUpperCase() : null, status: offerStatus(r, now), useCount: u?.n ?? 0, given,
        budgetLeft: budget === null ? null : Math.max(0, budget - given),
        targets: r.targets as OfferRow['targets'], targetIds: targets.filter((t) => t.discountId === r.id).map((t) => (t.productId ?? t.collectionId)!),
        tiers: tiers.filter((t) => t.discountId === r.id).map((t) => ({ min: Number(t.min), percentBps: t.percentBps, amountOff: n(t.amountOff) })),
        creators: creators.filter((c) => c.discountId === r.id).map((c) => ({ id: c.id, label: c.label!, code: c.code.toUpperCase(), useCount: byCode.get(c.id)?.n ?? 0, given: Number(byCode.get(c.id)?.given ?? 0) })),
      }
    })
  })
}

export type CreatorStat = {
  id: string
  /** In the window: orders using the code now, delivered, returned (RTO), ₹ given, and how many came by the link. */
  orders: number; delivered: number; rto: number; given: number; viaLink: number
  leak: Leak
}
export type OfferStat = {
  orders: number; given: number
  /** Average order total (after offers) of these orders, in paise. */
  aov: number | null
  prepaid: number
  /** Buyers who had ordered here before (priorOrderSql), and the rest. */
  repeat: number; fresh: number
  delivered: number; rto: number
  /** ₹ kept per delivered order (profit.ts; orders with unknown costs or pending freight left out), or null before one. */
  keptPerDelivered: number | null
  /** How its freight was counted (freight.ts): all actual; some estimated; some before shipping costs (no estimate). */
  keptBasis: KeptBasis
  /** ₹ given ÷ delivered orders, or null before one. */
  givenPerDelivered: number | null
  /** Creator codes, ranked by delivered orders. */
  creators: CreatorStat[]
}
export type KeptBasis = 'actual' | 'estimate' | 'none' | null

export type OfferStats = {
  days: number
  /** Every order with an offer in the window (an order with two offers counts once). */
  all: { orders: number; given: number; aov: number | null; prepaid: number; delivered: number; rto: number; givenPerDelivered: number | null }
  /** The shop's orders without one, in the same window: what the offers are judged against. */
  without: { orders: number; aov: number | null; delivered: number; rto: number }
  offers: Map<string, OfferStat>
}

/** Under this many orders an offer's numbers are "too few to judge" (the console says so). */
export const JUDGE_MIN_ORDERS = 30

const DAY = 86_400_000
type Delivered = { at: Date | string | null; net: string; cogs: string | null; fwd: string | null; rto: string | null; codfee: string | null; gw: string | null; base: string; cod: boolean; provider: 'self' | 'shiprocket' | null }
const num = (v: string | null) => (v === null ? null : Number(v))
const keptOf = (k: { kept: number | null; basis: KeptBasis }) => ({ keptPerDelivered: k.kept, keptBasis: k.basis })

/**
 * DID IT MAKE MONEY? The ONE computation of an offer's results (plan O·3, review 4): the orders placed in the last
 * `days` days that use an offer now (useOfRowSql, the same rule as limits), their state through stateSql, ₹ kept
 * through profit.ts, new vs repeat through priorOrderSql, and each creator code's week for its leak alert. Derived on
 * read; nothing stored. Driven by orders_tenant_placed and order_discounts_order_offer.
 */
export async function offerStats(tenantId: string, now = new Date(), opts: { days?: number; costs: boolean }): Promise<OfferStats> {
  return withTenant(tenantId, (tx) => offerStatsIn(tx, tenantId, now, opts.days ?? 30, opts.costs))
}

/** offerStats inside the caller's tenant transaction (the int test reads rows it will roll back). */
export async function offerStatsIn(tx: Tx, tenantId: string, now: Date, days = 30, costs = true): Promise<OfferStats> {
  const plans = await planHistoryIn(tx, tenantId)
  // Frrata's fee through the one rule (feeForOrder): the plan in force at the order's billableAt, on its merchandise net.
  const feeOf = (d: Delivered) => paise(feeForOrder(plans, { merchandiseNet: Number(d.base), billableAt: d.at ? new Date(d.at) : now })?.fee ?? 0)
  // The shop's confirmed shipping-cost estimates (Settings › Shipping costs), for orders shipped another way.
  const est = estimateOf(await shipCostsIn(tx, tenantId))
  const since = sql`${new Date(now.getTime() - days * DAY).toISOString()}::timestamptz`
  const st = stateSql(now, 'o')
  const prepaid = sql`${currentMethodSql('o')} = 'prepaid'`
  const used = sql`exists (select 1 from ${orderDiscounts} od where od.tenant_id = o.tenant_id and od.order_id = o.id and ${useOfRowSql(now)})`
  const [per, all, without, delivered, codes] = await Promise.all([
    tx.execute<{ id: string; n: number; given: string; total: string; prepaid: number; repeat: number; delivered: number; rto: number }>(sql`
      select od.discount_id id, count(*)::int n, sum(od.amount)::bigint given, sum(o.total)::bigint total, (count(*) filter (where ${prepaid}))::int prepaid,
             (count(*) filter (where ${priorOrderSql(now, tenantId, sql`o.phone`, { except: sql`o.id`, before: sql`o.placed_at` })}))::int repeat,
             (count(*) filter (where ${st} = 'delivered'))::int delivered, (count(*) filter (where ${st} in ('rto', 'rto_received')))::int rto
        from ${orderDiscounts} od join ${orders} o on o.tenant_id = od.tenant_id and o.id = od.order_id
       where od.tenant_id = ${tenantId} and o.tenant_id = ${tenantId} and o.placed_at >= ${since} and ${useOfRowSql(now)}
       group by od.discount_id`),
    tx.execute<{ n: number; total: string; prepaid: number; delivered: number; rto: number }>(sql`
      select count(*)::int n, coalesce(sum(o.total), 0)::bigint total, (count(*) filter (where ${prepaid}))::int prepaid,
             (count(*) filter (where ${st} = 'delivered'))::int delivered, (count(*) filter (where ${st} in ('rto', 'rto_received')))::int rto
        from ${orders} o where o.tenant_id = ${tenantId} and o.placed_at >= ${since} and ${used}`),
    tx.execute<{ n: number; total: string; delivered: number; rto: number }>(sql`
      select count(*)::int n, coalesce(sum(o.total), 0)::bigint total,
             (count(*) filter (where ${st} = 'delivered'))::int delivered, (count(*) filter (where ${st} in ('rto', 'rto_received')))::int rto
        from ${orders} o where o.tenant_id = ${tenantId} and o.placed_at >= ${since} and (${standingSql('o')} or ${holdingSql(now, 'o')}) and not ${used}`),
    // Delivered orders with an offer, with what profit.ts needs.
    tx.execute<Delivered & { id: string }>(sql`
      select od.discount_id id, ${billableAtSql('o')} at, o.net_revenue net, o.cogs, o.forward_shipping fwd, o.rto_shipping rto, o.courier_cod_fee codfee, o.gateway_fee gw, o.merchandise_net base,
             ${currentMethodSql('o')} = 'cod' cod,
             ${openShipmentProviderSql('o')} provider
        from ${orderDiscounts} od join ${orders} o on o.tenant_id = od.tenant_id and o.id = od.order_id
       where od.tenant_id = ${tenantId} and o.tenant_id = ${tenantId} and o.placed_at >= ${since} and ${useOfRowSql(now)} and ${st} = 'delivered'`),
    // Creator codes: the window's numbers, and the 35 days the leak alert reads (7 + the 28 before).
    tx.execute<{ id: string; discount_id: string; created_at: Date | string; n: number; given: string; link: number; delivered: number; rto: number; n7: number; link7: number; prev28: number }>(sql`
      select dc.id, dc.discount_id, dc.created_at,
             (count(od.id) filter (where o.placed_at >= ${since}))::int n, coalesce(sum(od.amount) filter (where o.placed_at >= ${since}), 0)::bigint given,
             (count(od.id) filter (where o.placed_at >= ${since} and od.via = 'link'))::int link,
             (count(od.id) filter (where o.placed_at >= ${since} and ${st} = 'delivered'))::int delivered,
             (count(od.id) filter (where o.placed_at >= ${since} and ${st} in ('rto', 'rto_received')))::int rto,
             (count(od.id) filter (where o.placed_at >= ${ago(now, 7)}))::int n7, (count(od.id) filter (where o.placed_at >= ${ago(now, 7)} and od.via = 'link'))::int link7,
             (count(od.id) filter (where o.placed_at < ${ago(now, 7)} and o.placed_at >= ${ago(now, 35)}))::int prev28
        from ${discountCodes} dc
        left join (${orderDiscounts} od join ${orders} o on o.tenant_id = od.tenant_id and o.id = od.order_id
                   and o.placed_at >= least(${since}, ${ago(now, 35)}) and ${useOfRowSql(now)})
          on od.tenant_id = dc.tenant_id and od.code_id = dc.id
       where dc.tenant_id = ${tenantId} and dc.label is not null
       group by dc.id`),
  ])
  // Freight through the one rule (freight.ts, Ship S0·6): a delivered order whose courier lines are still pending is
  // left out like one with unknown cost; the basis says whether any figure in the average was estimated or left out.
  // `costs` false (staff, partners): ₹ kept is a profit, so it is not even computed for them (tenancy audit 2026-11-08).
  const kept = (rows: Delivered[]): { kept: number | null; basis: KeptBasis } => {
    if (!plans.length || !costs) return { kept: null, basis: null }
    const known = rows.filter((d) => d.cogs !== null)
      .map((d) => ({ d, f: freightOf(d.provider, { forwardShipping: num(d.fwd), rtoShipping: num(d.rto), courierCodFee: num(d.codfee) }, est, { cod: !!d.cod, outcome: 'delivered' }) }))
      .filter((x) => x.f.source !== 'pending')
    if (!known.length) return { kept: null, basis: null }
    const sources = new Set<FreightSource>(known.map((x) => x.f.source))
    return {
      kept: Math.round(known.reduce((a, { d, f }) => a + orderProfit({
        netRevenue: paise(Number(d.net)), cogs: paise(Number(d.cogs)), forwardShipping: f.forwardShipping, rtoShipping: f.rtoShipping, codFee: f.codFee,
        gatewayFee: paise(Number(d.gw ?? 0)), packaging: paise(0), adCost: paise(0), platformFee: feeOf(d),
      }, 1).ifDelivered, 0) / known.length),
      basis: sources.has('none') ? 'none' : sources.has('estimate') ? 'estimate' : 'actual',
    }
  }
  const per1 = (a: number, b: number) => (b > 0 ? Math.round(a / b) : null)
  const startOfPrev = now.getTime() - 35 * DAY, endOfPrev = now.getTime() - 7 * DAY
  const offers = new Map<string, OfferStat>()
  for (const r of per) {
    const given = Number(r.given)
    offers.set(r.id, {
      orders: r.n, given, aov: per1(Number(r.total), r.n), prepaid: r.prepaid, repeat: r.repeat, fresh: r.n - r.repeat,
      delivered: r.delivered, rto: r.rto, ...keptOf(kept(delivered.filter((d) => d.id === r.id))), givenPerDelivered: per1(given, r.delivered),
      creators: [],
    })
  }
  for (const c of codes) {
    const made = new Date(c.created_at).getTime()
    const prevDays = Math.max(0, Math.min(28, Math.floor((endOfPrev - Math.max(made, startOfPrev)) / DAY)))
    const stat: CreatorStat = { id: c.id, orders: c.n, delivered: c.delivered, rto: c.rto, given: Number(c.given), viaLink: c.link,
      leak: leakOf({ last7: c.n7, viaLink7: c.link7, prev28: c.prev28, prevDays }) }
    const o = offers.get(c.discount_id)
    if (o) o.creators.push(stat)
    else if (c.n7 || stat.orders) offers.set(c.discount_id, { orders: 0, given: 0, aov: null, prepaid: 0, repeat: 0, fresh: 0, delivered: 0, rto: 0, keptPerDelivered: null, keptBasis: null, givenPerDelivered: null, creators: [stat] })
  }
  for (const o of offers.values()) o.creators.sort((a, b) => b.delivered - a.delivered || b.orders - a.orders)
  const a = all[0]!, w = without[0]!
  const givenAll = [...offers.values()].reduce((x, o) => x + o.given, 0)
  return {
    days,
    all: { orders: a.n, given: givenAll, aov: per1(Number(a.total), a.n), prepaid: a.prepaid, delivered: a.delivered, rto: a.rto, givenPerDelivered: per1(givenAll, a.delivered) },
    without: { orders: w.n, aov: per1(Number(w.total), w.n), delivered: w.delivered, rto: w.rto },
    offers,
  }
}

const ago = (now: Date, d: number) => sql`${new Date(now.getTime() - d * DAY).toISOString()}::timestamptz`

/** The shop's plan history, for feeForOrder (the fee is the plan in force when each order became billable). */
async function planHistoryIn(tx: Tx, tenantId: string) {
  return tx.select({ startsAt: tenantPlans.startsAt, planVersion: { feeBps: planVersions.feeBps } }).from(tenantPlans)
    .innerJoin(planVersions, eq(planVersions.id, tenantPlans.planVersionId)).where(eq(tenantPlans.tenantId, tenantId)).orderBy(asc(tenantPlans.startsAt))
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
