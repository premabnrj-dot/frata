import 'server-only'
import { and, asc, eq, isNull, sql, type SQL } from 'drizzle-orm'
import { classifySource, type Channel } from '@/domains/analytics/source'
import { keptOf, type Kept, type KeptGroup } from '@/domains/orders/kept'
import { estimateOf } from '@/domains/settings/ship-costs'
import type { MemberRole } from '@/domains/tenancy/roles'
import { istDayStart } from '@/domains/time/day'
import type { Tx } from '@/lib/db'
import { discountCodes, orderDiscounts } from '@/lib/db/schema-discounts'
import { orders, shipments } from '@/lib/db/schema-orders'
import { collections, products } from '@/lib/db/schema-catalogue'
import { useOfRowSql } from '@/lib/db/discount-predicates'
import { currentMethodSql, feeBucketSql, holdingSql, stageSql, standingSql } from '@/lib/db/order-predicates'
import { withTenant } from '@/lib/db/tenant'
import { costsVisibleIn, planHistoryIn, shipCostsIn } from './settings'

// =============================================================================
// FILE: src/lib/queries/analytics.ts
//
// WHERE ORDERS CAME FROM, JUDGED ON DELIVERIES (Analytics A·1; plan docs/plans/2026-11-08-analytics-a1.md § Plan
// review 16, measured at 10×). One tenant transaction: who sees ₹, the plan history and the shipping-cost estimate, then
// ONE grouped read over the period and the one before (orders grouped by their raw attribution inputs, the creator
// code they use, where they stand, and what decides their ₹ kept; money summed in SQL), classified in TypeScript by
// classifySource and summed by keptOf. Never one row per order (52.6 MB at 10×); never a stored classifier output.
// "Orders" are standing or holding orders (as Offers counts them); sales are their totals.
// =============================================================================

export const PERIODS = [7, 30, 90] as const
export type Period = (typeof PERIODS)[number]
export const isPeriod = (n: number): n is Period => (PERIODS as readonly number[]).includes(n)

export type Stage = 'delivered' | 'rto' | 'lost' | 'on_the_way' | 'not_sent'
export type Totals = {
  orders: number; sales: number; cod: number
  delivered: number; rto: number; lost: number; onTheWay: number; notSent: number
  /** ₹ kept after returns (kept.ts), or null for a viewer who does not see costs. */
  kept: Kept | null
}
export type SourceStat = { slug: string; label: string; channel: Channel; cur: Totals; prev: Totals; campaigns: { name: string; cur: Totals }[] }
export type Analytics = {
  period: Period
  /** The first moment of the period, and of the period before (IST days). */
  start: Date; prevStart: Date
  costs: boolean
  /** Whether a confirmed shipping-cost estimate exists (else ₹ kept is "before shipping costs"). */
  estimate: boolean
  cur: Totals; prev: Totals
  /** Orders in the period whose source is known (not "Direct or unknown"). */
  known: number
  sources: SourceStat[]
  /** Pincodes with the most returns in the period: returns and outcomes, counts only. */
  pincodes: { pincode: string; rto: number; outcomes: number }[]
}

type Row = {
  cur: boolean; us: string | null; um: string | null; uc: string | null; rh: string | null; gads: boolean; srs: boolean; fb: boolean
  cl: string | null; cc: string | null; stage: Stage; cod: boolean; provider: 'self' | 'shiprocket' | null; bucket: number
  n: number; sales: string; net: string; cogs: string | null; fwd: string | null; rto: string | null; codfee: string | null; gw: string; base: string
}

const blank = (): Totals & { groups: KeptGroup[] } => ({ orders: 0, sales: 0, cod: 0, delivered: 0, rto: 0, lost: 0, onTheWay: 0, notSent: 0, kept: null, groups: [] })
const num = (v: string | null) => (v === null ? null : Number(v))
const STAGE_KEY: Record<Stage, 'delivered' | 'rto' | 'lost' | 'onTheWay' | 'notSent'> = { delivered: 'delivered', rto: 'rto', lost: 'lost', on_the_way: 'onTheWay', not_sent: 'notSent' }

/** The grouped read: the period and the one before, standing or holding orders, by raw inputs and what decides ₹ kept. */
function windowSql(tenantId: string, now: Date, start: Date, prevStart: Date, feeChanges: readonly Date[], only?: SQL) {
  const attr = sql`(o.checkout -> 'attribution')`
  const cur = sql`(o.placed_at >= ${start.toISOString()}::timestamptz)`
  // An order with an outcome, by its own columns (cheap): only these carry the keys that decide ₹ kept, so the others
  // fold into fewer groups (measured at 10×: the groups' transfer to Node, not the scan, was the cost).
  const outcome = sql`(o.delivered_at is not null or o.rto_initiated_at is not null or o.lost_at is not null)`
  return sql`
    select ${cur} cur,
           ${attr} ->> 'utm_source' us, ${attr} ->> 'utm_medium' um, case when ${cur} then ${attr} ->> 'utm_campaign' end uc, ${attr} ->> 'ref_host' rh,
           coalesce(jsonb_exists_any(${attr}, array['gclid', 'gbraid', 'wbraid', 'gad_source']), false) gads,
           coalesce(jsonb_exists(${attr}, 'srsltid'), false) srs, coalesce(jsonb_exists(${attr}, 'fbclid'), false) fb,
           dc.label cl, dc.code cc, ${stageSql('o')} stage, (${currentMethodSql('o')} = 'cod') cod, case when ${outcome} then s.provider end provider,
           ${feeBucketSql('o', feeChanges)} bucket,
           count(*)::int n, coalesce(sum(o.total), 0)::bigint sales, coalesce(sum(o.net_revenue), 0)::bigint net, sum(o.cogs)::bigint cogs,
           sum(o.forward_shipping)::bigint fwd, sum(o.rto_shipping)::bigint rto, sum(o.courier_cod_fee)::bigint codfee,
           coalesce(sum(o.gateway_fee), 0)::bigint gw, coalesce(sum(o.merchandise_net), 0)::bigint base
      from ${orders} o
      left join ${shipments} s on s.tenant_id = o.tenant_id and s.order_id = o.id and s.ended_at is null
      left join (${orderDiscounts} od join ${discountCodes} dc on dc.tenant_id = od.tenant_id and dc.id = od.code_id and dc.label is not null)
        on od.tenant_id = o.tenant_id and od.order_id = o.id and ${useOfRowSql(now)}
     where o.tenant_id = ${tenantId} and o.placed_at >= ${prevStart.toISOString()}::timestamptz and o.placed_at < ${now.toISOString()}::timestamptz
       and (${standingSql('o')} or ${holdingSql(now, 'o')}) ${only ? sql`and ${only}` : sql``}
     group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, (${outcome} and o.cogs is null), (${outcome} and o.forward_shipping is null),
              (${outcome} and o.rto_shipping is null), (${outcome} and o.courier_cod_fee is null)`
}

const sourceOf = (r: Pick<Row, 'us' | 'um' | 'uc' | 'rh' | 'gads' | 'srs' | 'fb' | 'cl' | 'cc'>) => classifySource({
  utm_source: r.us ?? undefined, utm_medium: r.um ?? undefined, utm_campaign: r.uc ?? undefined, ref_host: r.rh ?? undefined,
  gclid: r.gads ? '1' : undefined, srsltid: r.srs ? '1' : undefined, fbclid: r.fb ? '1' : undefined,
}, r.cl && r.cc ? { label: r.cl, code: r.cc } : null)

/** Reads the analytics transaction needs first (who sees ₹, plan history, the estimate), with its limits set. */
async function setUp(tx: Tx, tenantId: string, role: MemberRole) {
  // JIT added 535–590 ms to every window read at 10× (speed review); 3 s is the most a page may hold a connection.
  await tx.execute(sql`set local jit = off`)
  await tx.execute(sql`set local statement_timeout = '3s'`)
  // The grouping sorts 150k rows at 10×: in memory, not spilled to disk (a 15 MB external merge cost ~600 ms).
  await tx.execute(sql`set local work_mem = '64MB'`)
  const [costs, history, shipCosts] = await Promise.all([costsVisibleIn(tx, tenantId, role), planHistoryIn(tx, tenantId), shipCostsIn(tx, tenantId)])
  return { costs, history, est: estimateOf(shipCosts) }
}

/** The page's numbers for `period` IST days (today included) against the period before. */
export async function analyticsFor(tenantId: string, role: MemberRole, period: Period, now = new Date()): Promise<Analytics> {
  return withTenant(tenantId, (tx) => analyticsIn(tx, tenantId, role, period, now))
}

/** analyticsFor inside the caller's tenant transaction (the int test reads rows it will roll back). */
export async function analyticsIn(tx: Tx, tenantId: string, role: MemberRole, period: Period, now: Date): Promise<Analytics> {
  {
    const { costs, history, est } = await setUp(tx, tenantId, role)
    const start = istDayStart(now, -(period - 1)), prevStart = istDayStart(now, -(2 * period - 1))
    const rows = await tx.execute<Row>(windowSql(tenantId, now, start, prevStart, history.map((h) => h.startsAt)))
    // Returns by pincode, counts only (₹ by pincode is True Profit's): the covering partial index makes it index-only.
    const pins = await tx.execute<{ pincode: string; rto: number; outcomes: number }>(sql`
      select o.pincode, (count(*) filter (where o.rto_initiated_at is not null))::int rto, count(*)::int outcomes
        from ${orders} o
       where o.tenant_id = ${tenantId} and o.placed_at >= ${start.toISOString()}::timestamptz and o.cancelled_at is null
         and (o.rto_initiated_at is not null or o.delivered_at is not null or o.lost_at is not null) and o.pincode is not null and o.pincode <> ''
       group by o.pincode having count(*) filter (where o.rto_initiated_at is not null) > 0
       order by 2 desc, 3 desc limit 10`)

    const cur = blank(), prev = blank()
    const bySource = new Map<string, { slug: string; label: string; channel: Channel; cur: ReturnType<typeof blank>; prev: ReturnType<typeof blank>; campaigns: Map<string, ReturnType<typeof blank>> }>()
    let known = 0
    for (const r of rows) {
      const src = sourceOf(r)
      let s = bySource.get(src.slug)
      if (!s) bySource.set(src.slug, (s = { slug: src.slug, label: src.label, channel: src.channel, cur: blank(), prev: blank(), campaigns: new Map() }))
      const targets = [r.cur ? cur : prev, r.cur ? s.cur : s.prev]
      if (r.cur && src.campaign) {
        let c = s.campaigns.get(src.campaign)
        if (!c) s.campaigns.set(src.campaign, (c = blank()))
        targets.push(c)
      }
      if (r.cur && src.channel !== 'direct') known += r.n
      const group: KeptGroup | null = r.stage === 'delivered' || r.stage === 'rto' || r.stage === 'lost' ? {
        outcome: r.stage, n: r.n, provider: r.provider, cod: !!r.cod, net: Number(r.net), cogs: num(r.cogs), forward: num(r.fwd), rto: num(r.rto),
        courierCodFee: num(r.codfee), gateway: Number(r.gw), base: Number(r.base), feeBps: r.bucket > 0 ? history[r.bucket - 1]?.feeBps ?? null : null,
      } : null
      for (const t of targets) {
        t.orders += r.n; t.sales += Number(r.sales); if (r.cod) t.cod += r.n
        t[STAGE_KEY[r.stage]] += r.n
        if (group) t.groups.push(group)
      }
    }
    const done = (t: ReturnType<typeof blank>): Totals => {
      const { groups, ...rest } = t
      return { ...rest, kept: costs ? keptOf(groups, est) : null }
    }
    const sources: SourceStat[] = [...bySource.values()].map((s) => ({
      slug: s.slug, label: s.label, channel: s.channel, cur: done(s.cur), prev: done(s.prev),
      campaigns: [...s.campaigns.entries()].map(([name, c]) => ({ name, cur: done(c) })).sort((a, b) => b.cur.orders - a.cur.orders),
    }))
    // Most ₹ kept after returns first; by orders until any outcome is known (or for a viewer who does not see costs).
    sources.sort((a, b) => ((b.cur.kept?.counted ?? 0) > 0 || (a.cur.kept?.counted ?? 0) > 0 ? (b.cur.kept?.kept ?? 0) - (a.cur.kept?.kept ?? 0) : 0) || b.cur.orders - a.cur.orders)
    return {
      period, start, prevStart, costs, estimate: est !== null, cur: done(cur), prev: done(prev), known, sources,
      pincodes: pins.map((p) => ({ pincode: p.pincode, rto: p.rto, outcomes: p.outcomes })),
    }
  }
}

/**
 * A source's own page: its numbers (as on the list) and its last 50 orders in the period. The slug is classifier
 * output from the URL, matched in TypeScript against the grouped read's raw tuples, which then filter one LIMIT 50 read
 * (speed review 4): the URL's value never reaches SQL. Null for a slug no order in the period has.
 */
export async function sourcePage(tenantId: string, role: MemberRole, period: Period, slug: string, now = new Date()) {
  if (!/^[a-z0-9-]{1,64}$/.test(slug)) return null
  return withTenant(tenantId, (tx) => sourcePageIn(tx, tenantId, role, period, slug, now))
}

/** sourcePage inside the caller's tenant transaction: the list's numbers and the source's orders in one snapshot. */
export async function sourcePageIn(tx: Tx, tenantId: string, role: MemberRole, period: Period, slug: string, now: Date) {
  if (!/^[a-z0-9-]{1,64}$/.test(slug)) return null
  const all = await analyticsIn(tx, tenantId, role, period, now)
  const stat = all.sources.find((s) => s.slug === slug)
  if (!stat) return null
  {
    const start = all.start
    const tuples = await tx.execute<Pick<Row, 'us' | 'um' | 'uc' | 'rh' | 'gads' | 'srs' | 'fb' | 'cl' | 'cc'>>(sql`
      select distinct o.checkout -> 'attribution' ->> 'utm_source' us, o.checkout -> 'attribution' ->> 'utm_medium' um, null::text uc,
             o.checkout -> 'attribution' ->> 'ref_host' rh,
             coalesce(jsonb_exists_any(o.checkout -> 'attribution', array['gclid', 'gbraid', 'wbraid', 'gad_source']), false) gads,
             coalesce(jsonb_exists(o.checkout -> 'attribution', 'srsltid'), false) srs, coalesce(jsonb_exists(o.checkout -> 'attribution', 'fbclid'), false) fb,
             dc.label cl, dc.code cc
        from ${orders} o
        left join (${orderDiscounts} od join ${discountCodes} dc on dc.tenant_id = od.tenant_id and dc.id = od.code_id and dc.label is not null)
          on od.tenant_id = o.tenant_id and od.order_id = o.id and ${useOfRowSql(now)}
       where o.tenant_id = ${tenantId} and o.placed_at >= ${start.toISOString()}::timestamptz and (${standingSql('o')} or ${holdingSql(now, 'o')})`)
    const mine = tuples.filter((t) => sourceOf(t).slug === slug)
    if (!mine.length) return { stat, orders: [] }
    const eq = (col: SQL, v: string | null) => sql`${col} is not distinct from ${v}`
    const match = sql.join(mine.map((t) => sql`(${eq(sql`o.checkout -> 'attribution' ->> 'utm_source'`, t.us)} and ${eq(sql`o.checkout -> 'attribution' ->> 'utm_medium'`, t.um)}
      and ${eq(sql`o.checkout -> 'attribution' ->> 'ref_host'`, t.rh)}
      and coalesce(jsonb_exists_any(o.checkout -> 'attribution', array['gclid', 'gbraid', 'wbraid', 'gad_source']), false) = ${t.gads}
      and coalesce(jsonb_exists(o.checkout -> 'attribution', 'srsltid'), false) = ${t.srs} and coalesce(jsonb_exists(o.checkout -> 'attribution', 'fbclid'), false) = ${t.fb}
      and ${eq(sql`dc.code`, t.cc)})`), sql` or `)
    const list = await tx.execute<{ number: number; placed_at: Date | string; total: string; stage: Stage; campaign: string | null }>(sql`
      select o.number, o.placed_at, o.total, ${stageSql('o')} stage, o.checkout -> 'attribution' ->> 'utm_campaign' campaign
        from ${orders} o
        left join (${orderDiscounts} od join ${discountCodes} dc on dc.tenant_id = od.tenant_id and dc.id = od.code_id and dc.label is not null)
          on od.tenant_id = o.tenant_id and od.order_id = o.id and ${useOfRowSql(now)}
       where o.tenant_id = ${tenantId} and o.placed_at >= ${start.toISOString()}::timestamptz and (${standingSql('o')} or ${holdingSql(now, 'o')}) and (${match})
       order by o.placed_at desc limit 50`)
    return { stat, orders: list.map((o) => ({ number: o.number, placedAt: new Date(o.placed_at), total: Number(o.total), stage: o.stage, campaign: o.campaign })) }
  }
}

/** What Make a link can open: the shop's live products and its collections, by address (plan review 13: the dialog
 * offers only these, from the same shop; it never takes a typed host or path). */
export async function linkTargets(tenantId: string) {
  return withTenant(tenantId, async (tx) => {
    const [ps, cs] = await Promise.all([
      tx.select({ handle: products.handle, title: products.title }).from(products)
        .where(and(eq(products.tenantId, tenantId), eq(products.status, 'active'), isNull(products.archivedAt))).orderBy(asc(products.title)).limit(200),
      tx.select({ handle: collections.handle, title: collections.title }).from(collections).where(eq(collections.tenantId, tenantId)).orderBy(asc(collections.title)).limit(100),
    ])
    return { products: ps, collections: cs }
  })
}
