import 'server-only'
import { sql } from 'drizzle-orm'
import { OTHER_PRODUCTS, emptyTotals, type TrafficRead, type TrafficTotals } from '@/domains/analytics/traffic'
import { istDayKey } from '@/domains/time/day'
import { withAnalyticsTenant } from '@/lib/db/analytics'
import { orderLines, orders } from '@/lib/db/schema-orders'
import { products } from '@/lib/db/schema-catalogue'
import { discountCodes } from '@/lib/db/schema-discounts'
import { standingSql } from '@/lib/db/order-predicates'
import { withTenant } from '@/lib/db/tenant'
import { isAnalyticsConfigured } from '@/lib/env'

// =============================================================================
// FILE: src/lib/queries/traffic.ts — Console › Analytics' visits (A·2 · A2·4). Two databases, never one transaction
// (ADR-0013; architecture review MAJOR 5):
//   trafficRead  the analytics database's rollups for the window and the one before (withAnalyticsTenant, read only);
//   trafficNames the shop's own words for what visits carry: creator labels, product names and their orders, returns
//                by city (withTenant). An id the shop doesn't have is never named (security review: forged beacons).
// The page runs trafficRead beside A·1's snapshot (Promise.all) and treats a failure as "Visits unavailable".
// =============================================================================

const NIL = '00000000-0000-0000-0000-000000000000'
const n = (v: unknown) => Number(v ?? 0)

/** The window's rollups (IST days from `start`, and the window before from `prevStart`); 'off' when the shop has no
 * analytics database to read (a preview, or before it is connected). */
export async function trafficRead(tenantId: string, start: Date, prevStart: Date, now: Date): Promise<TrafficRead | 'off'> {
  if (!isAnalyticsConfigured()) return 'off'
  const from = istDayKey(start), prevFrom = istDayKey(prevStart), to = istDayKey(now)
  return withAnalyticsTenant(tenantId, async (tx) => {
    // Reads only the rollups (tenant first in every key); each statement is the shop's own rows by policy too.
    const q = <T>(s: ReturnType<typeof sql>) => tx.execute(s) as unknown as Promise<T[]>
    const [first, totals, sources, browsers, cities, prods, vitals, lcp] = await Promise.all([
      q<{ d: string | null }>(sql`select min(day)::text d from traffic_daily where tenant_id = ${tenantId}`),
      q<Record<string, unknown>>(sql`select (day >= ${from}::date) cur, sum(visitors) visitors, sum(views) views, sum(product_visitors) pv, sum(bag_visitors) bv,
          sum(checkout_visitors) cv, sum(ordered_visitors) ov, sum(phone) phone, sum(computer) computer, sum(tablet) tablet
        from traffic_daily where tenant_id = ${tenantId} and day >= ${prevFrom}::date and day <= ${to}::date group by 1`),
      q<Record<string, unknown>>(sql`select us, um, uc, rh, cc, gads, srs, fb, sum(visitors) visitors, sum(ordered_visitors) ordered
        from source_daily where tenant_id = ${tenantId} and day >= ${from}::date and day <= ${to}::date group by 1, 2, 3, 4, 5, 6, 7, 8`),
      q<Record<string, unknown>>(sql`select device, browser, in_app, sum(visitors) visitors, sum(ordered_visitors) ordered
        from browser_daily where tenant_id = ${tenantId} and day >= ${from}::date and day <= ${to}::date group by 1, 2, 3`),
      q<Record<string, unknown>>(sql`select city, sum(visitors) visitors, sum(ordered_visitors) ordered
        from city_daily where tenant_id = ${tenantId} and day >= ${from}::date and day <= ${to}::date group by 1 order by 2 desc limit 60`),
      q<Record<string, unknown>>(sql`select product_id, sum(views) views, sum(adds) adds
        from product_daily where tenant_id = ${tenantId} and day >= ${from}::date and day <= ${to}::date and product_id <> ${OTHER_PRODUCTS}::uuid
        group by 1 order by 2 desc limit 100`),
      // All pages' histograms, summed per metric in SQL (64 buckets each).
      q<{ metric: 'lcp' | 'inp' | 'cls'; n: unknown; buckets: number[] }>(sql`
        select v.metric, sum(v.n) n, array(select sum(b.c)::int from vitals_daily w, unnest(w.buckets) with ordinality b(c, i)
               where w.tenant_id = ${tenantId} and w.metric = v.metric and w.product_id = ${NIL}::uuid and w.day >= ${from}::date and w.day <= ${to}::date
               group by b.i order by b.i) buckets
        from vitals_daily v where v.tenant_id = ${tenantId} and v.product_id = ${NIL}::uuid and v.day >= ${from}::date and v.day <= ${to}::date group by v.metric`),
      // LCP per product page, for the 20 most measured (the slowest of the shop's own among them). Generous limits, as
      // forged ids can take slots until trafficNames drops them (tenancy audit LOW).
      q<{ product_id: string; n: unknown; buckets: number[] }>(sql`
        with top as (select product_id, sum(n) n from vitals_daily where tenant_id = ${tenantId} and metric = 'lcp' and product_id <> ${NIL}::uuid
                       and day >= ${from}::date and day <= ${to}::date group by 1 order by 2 desc limit 20)
        select t.product_id, t.n, array(select sum(b.c)::int from vitals_daily w, unnest(w.buckets) with ordinality b(c, i)
               where w.tenant_id = ${tenantId} and w.metric = 'lcp' and w.product_id = t.product_id and w.day >= ${from}::date and w.day <= ${to}::date
               group by b.i order by b.i) buckets
        from top t`),
    ])
    const tot = (cur: boolean): TrafficTotals => {
      const r = totals.find((x) => x.cur === cur)
      return r ? { visitors: n(r.visitors), views: n(r.views), productVisitors: n(r.pv), bagVisitors: n(r.bv), checkoutVisitors: n(r.cv), orderedVisitors: n(r.ov), phone: n(r.phone), computer: n(r.computer), tablet: n(r.tablet) } : emptyTotals()
    }
    return {
      firstDay: first[0]?.d ?? null, cur: tot(true), prev: tot(false),
      sources: sources.map((r) => ({ us: String(r.us), um: String(r.um), uc: String(r.uc), rh: String(r.rh), cc: String(r.cc), gads: !!r.gads, srs: !!r.srs, fb: !!r.fb, visitors: n(r.visitors), ordered: n(r.ordered) })),
      browsers: browsers.map((r) => ({ device: String(r.device), browser: String(r.browser), inApp: String(r.in_app), visitors: n(r.visitors), ordered: n(r.ordered) })),
      cities: cities.map((r) => ({ city: String(r.city), visitors: n(r.visitors), ordered: n(r.ordered) })),
      products: prods.map((r) => ({ productId: String(r.product_id), views: n(r.views), adds: n(r.adds) })),
      vitals: vitals.map((r) => ({ metric: r.metric, n: n(r.n), buckets: r.buckets.map(Number) })),
      productLcp: lcp.map((r) => ({ productId: r.product_id, n: n(r.n), buckets: r.buckets.map(Number) })),
    }
  })
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The shop's own words for the visits: creator labels by code, its products' names and orders in the window (only ids
 * it has: a forged one is never named), and returns by city. */
export async function trafficNames(tenantId: string, productIds: readonly string[], start: Date) {
  const ids = [...new Set(productIds.filter((id) => UUID.test(id)))].slice(0, 120)
  return withTenant(tenantId, async (tx) => {
    const [labels, named, cities] = await Promise.all([
      tx.execute<{ code: string; label: string }>(sql`select upper(code) code, label from ${discountCodes} where tenant_id = ${tenantId} and label is not null`),
      // One grouped join driven by the window's standing orders (order_lines_product_live, drizzle/0118: live lines only), never a count per
      // product (speed review 2026-11-11: 40 scans of order_lines, 1.8 s at 10×).
      ids.length ? tx.execute<{ id: string; title: string; handle: string; ordered: number }>(sql`
        with w as (select o.id from ${orders} o where o.tenant_id = ${tenantId} and o.placed_at >= ${start.toISOString()}::timestamptz and ${standingSql('o')}),
             n as (select ol.product_id, count(distinct ol.order_id)::int ordered from ${orderLines} ol join w on w.id = ol.order_id
                    where ol.tenant_id = ${tenantId} and ol.removed_at is null and ol.product_id = any(${`{${ids.join(',')}}`}::uuid[]) group by ol.product_id)
        select p.id, p.title, p.handle, coalesce(n.ordered, 0) ordered
          from ${products} p left join n on n.product_id = p.id
         where p.tenant_id = ${tenantId} and p.id = any(${`{${ids.join(',')}}`}::uuid[])`) : Promise.resolve([]),
      tx.execute<{ city: string; rto: number; outcomes: number }>(sql`
        select lower(o.city) city, (count(*) filter (where o.rto_initiated_at is not null))::int rto, count(*)::int outcomes
          from ${orders} o
         where o.tenant_id = ${tenantId} and o.placed_at >= ${start.toISOString()}::timestamptz and o.cancelled_at is null and o.city <> ''
           and (o.rto_initiated_at is not null or o.delivered_at is not null or o.lost_at is not null)
         group by 1 order by 3 desc limit 60`),
    ])
    return {
      labels: new Map([...labels].map((l) => [l.code, l.label])),
      products: new Map([...named].map((p) => [p.id, { title: p.title, handle: p.handle, ordered: Number(p.ordered) }])),
      cityReturns: new Map([...cities].map((c) => [c.city, { rto: Number(c.rto), outcomes: Number(c.outcomes) }])),
    }
  }, { snapshot: true })
}
