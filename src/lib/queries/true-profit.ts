import 'server-only'
import { sql, type SQL } from 'drizzle-orm'
import { keptOf, type Kept, type KeptGroup } from '@/domains/orders/kept'
import { estimateOf } from '@/domains/settings/ship-costs'
import type { MemberRole } from '@/domains/tenancy/roles'
import { istDayStart } from '@/domains/time/day'
import type { Tx } from '@/lib/db'
import { creditedSql, currentMethodSql, feeBaseSql, feeBucketSql, keptSql, rtoRestockedSql, stateSql, type KeptRow } from '@/lib/db/order-predicates'
import { orders } from '@/lib/db/schema-orders'
import { withTenant } from '@/lib/db/tenant'
import { groupsOf } from './discounts'
import { costsVisibleIn, planHistoryIn, shipCostsIn } from './settings'

// =============================================================================
// FILE: src/lib/queries/true-profit.ts — TRUE PROFIT (plan docs/plans/2026-11-12-true-profit-a3.md; approved mockup
// https://claude.ai/artifact/XsfTjzmh8nYqFpbFBCLSth). ₹ kept after returns, by product, by size and colour, and by PIN
// code — through the ONE rule, keptOf (src/domains/orders/kept.ts), on SQL groups (never per-order rows to Node).
// - By PIN code: order level, exact — keptSql with the PIN code as a lead key. Only PIN codes with ≥ 5 orders with an
//   outcome, the 50 busiest (review Sec L2: one order would point at one shopper; Arch 9: bounded groups).
// - By product and by variant: a line carries its order's money in proportion to its taxable value (its weight,
//   taxable_value / merchandise_net); its COGS is its own, less pieces a return put back in stock. keptOf takes the
//   weighted sums, the weight as `n` (review Arch B2). A line counts as returned when its order came back or a return
//   credit note names it (review Arch 10).
// Owners and admins (and a partner before handover) only: costsVisibleIn, read in the same transaction, failing closed.
// =============================================================================

export const TP_PERIODS = [7, 30, 90] as const
export type TpPeriod = (typeof TP_PERIODS)[number]
export const isTpPeriod = (n: number): n is TpPeriod => (TP_PERIODS as readonly number[]).includes(n)
const MIN_PIN_ORDERS = 5

export type Line = { id: string; name: string; delivered: number; returned: number; lost: number; kept: number; leftOut: number }
export type PinRow = { pincode: string; place: string | null; codOrders: number; codReturned: number; codKept: number | null; prepaidKept: number | null }
export type TrueProfit = {
  period: TpPeriod
  total: Kept
  returned: number; lost: number; delivered: number
  codRate: number | null; prepaidRate: number | null
  /** Products in the window's lines with no cost price (left out of ₹ kept). */
  noCost: number
  products: Line[]
  pincodes: PinRow[]
}

const pct = (r: number, d: number) => (r + d > 0 ? r / (r + d) : null)

/** Everything the page shows, in ONE tenant transaction. Null when this member may not see costs. */
export function trueProfitPage(tenantId: string, role: MemberRole, period: TpPeriod, now = new Date()) {
  return withTenant(tenantId, (tx) => trueProfitIn(tx, tenantId, role, period, now))
}

export async function trueProfitIn(tx: Tx, tenantId: string, role: MemberRole, period: TpPeriod, now: Date): Promise<TrueProfit | null> {
  await tx.execute(sql`set local jit = off`)
  await tx.execute(sql`set local statement_timeout = '3s'`)
  const [costs, history, shipCosts] = await Promise.all([costsVisibleIn(tx, tenantId, role), planHistoryIn(tx, tenantId), shipCostsIn(tx, tenantId)])
  if (!costs) return null
  const est = estimateOf(shipCosts)
  const fees = history.map((h) => h.startsAt)
  const since = istDayStart(now, -(period - 1))
  const win = sql`o.tenant_id = ${tenantId} and o.placed_at >= ${since.toISOString()}::timestamptz and o.placed_at < ${now.toISOString()}::timestamptz`
  const kept = keptSql(now, 'o', fees)

  const [all, lines, pins, noCost] = await Promise.all([
    tx.execute<KeptRow>(sql`select ${kept.columns} from ${orders} o where ${win} and ${kept.where} group by ${kept.groupBy(0)}`),
    tx.execute<LineRow>(lineSql(win, now, fees, sql`ol.product_id`, sql`coalesce(p.title, min(ol.title))`)),
    tx.execute<KeptRow & { pincode: string; place: string | null }>(sql`
      with busy as (
        select o.pincode from ${orders} o where ${win} and ${kept.where} and o.pincode ~ '^[1-9][0-9]{5}$'
         group by o.pincode having count(*) >= ${MIN_PIN_ORDERS} order by count(*) desc limit 50)
      select o.pincode, (select pc.city from pincodes pc where pc.pincode = o.pincode) place, ${kept.columns}
        from ${orders} o join busy b on b.pincode = o.pincode
       where ${win} and ${kept.where}
       group by 1, ${kept.groupBy(2)}`),
    tx.execute<{ n: number }>(sql`
      select count(distinct ol.product_id)::int n from order_lines ol join ${orders} o on o.tenant_id = ol.tenant_id and o.id = ol.order_id
       where ${win} and ${kept.where} and ol.unit_cost is null and ol.product_id is not null`),
  ])
  const total = keptOf(groupsOf(all, history), est)
  const byCod = (cod: boolean) => keptOf(groupsOf(all.filter((r) => !!r.cod === cod), history), est)
  const cod = byCod(true), pre = byCod(false)

  // Pincodes: COD and prepaid apart (the question is where pay on delivery loses money).
  const pinMap = new Map<string, { place: string | null; cod: KeptRow[]; pre: KeptRow[] }>()
  for (const r of pins) {
    const e = pinMap.get(r.pincode) ?? { place: r.place, cod: [], pre: [] }
    ;(r.cod ? e.cod : e.pre).push(r)
    pinMap.set(r.pincode, e)
  }
  const pincodes: PinRow[] = [...pinMap].map(([pincode, e]) => {
    const c = keptOf(groupsOf(e.cod, history), est), p = keptOf(groupsOf(e.pre, history), est)
    return { pincode, place: e.place, codOrders: e.cod.reduce((a, r) => a + r.n, 0), codReturned: e.cod.filter((r) => r.outcome === 'rto').reduce((a, r) => a + r.n, 0),
      codKept: c.counted ? c.kept : null, prepaidKept: p.counted ? p.kept : null }
  }).sort((a, b) => (a.codKept ?? 0) - (b.codKept ?? 0))

  return {
    period, total, delivered: total.delivered.n, returned: total.rto.n, lost: total.lost.n,
    codRate: pct(cod.rto.n, cod.delivered.n), prepaidRate: pct(pre.rto.n, pre.delivered.n),
    noCost: noCost[0]?.n ?? 0,
    products: linesOf(lines, history, est),
    pincodes,
  }
}

/** One product's sizes and colours (opened from Products), in the caller's tenant transaction. */
export async function variantsIn(tx: Tx, tenantId: string, role: MemberRole, period: TpPeriod, productId: string, now: Date): Promise<Line[] | null> {
  const [costs, history, shipCosts] = await Promise.all([costsVisibleIn(tx, tenantId, role), planHistoryIn(tx, tenantId), shipCostsIn(tx, tenantId)])
  if (!costs) return null
  const since = istDayStart(now, -(period - 1))
  const win = sql`o.tenant_id = ${tenantId} and o.placed_at >= ${since.toISOString()}::timestamptz and o.placed_at < ${now.toISOString()}::timestamptz and ol.product_id = ${productId}`
  const rows = await tx.execute<LineRow>(lineSql(win, now, history.map((h) => h.startsAt), sql`ol.variant_id`, sql`array_to_string(min(ol.option_values), ' · ')`))
  return linesOf(rows, history, estimateOf(shipCosts))
}

export function variantsFor(tenantId: string, role: MemberRole, period: TpPeriod, productId: string, now = new Date()) {
  return withTenant(tenantId, (tx) => variantsIn(tx, tenantId, role, period, productId, now))
}

type LineRow = KeptRow & { key: string | null; name: string; w: number; dl: number; rl: number; ll: number }

/**
 * Lines grouped by `key` and by what decides ₹ kept (as keptSql), each carrying its weight of its order's money. The
 * outcome counts are lines: delivered and not returned on a credit note, returned (came back or credited), lost.
 */
function lineSql(win: SQL, now: Date, fees: readonly Date[], key: SQL, name: SQL) {
  const st = stateSql(now, 'o')
  const outcome = sql`(case when ${st} = 'delivered' then 'delivered' when ${st} in ('rto', 'rto_received') then 'rto' else 'lost' end)`
  const w = sql`(case when o.merchandise_net > 0 then ol.taxable_value::numeric / o.merchandise_net else 0 end)`
  const credited = sql`exists (select 1 from credit_note_lines l join credit_notes cn on cn.tenant_id = l.tenant_id and cn.id = l.credit_note_id
    where l.tenant_id = ol.tenant_id and l.order_line_id = ol.id and cn.kind = 'return')`
  const restockedCost = sql`(select coalesce(sum(l.restocked_qty), 0) from credit_note_lines l join credit_notes cn on cn.tenant_id = l.tenant_id and cn.id = l.credit_note_id
    where l.tenant_id = ol.tenant_id and l.order_line_id = ol.id and cn.kind = 'return') * ol.unit_cost`
  return sql`
    select ${key} key, ${name} name, ${outcome} outcome, s.provider provider, (${currentMethodSql('o')} = 'cod') cod, ${feeBucketSql('o', fees)} bucket,
           ${rtoRestockedSql('o')} restocked, sum(${w})::float8 w, count(*)::int n,
           (count(*) filter (where ${st} = 'delivered' and not ${credited}))::int dl,
           (count(*) filter (where ${st} in ('rto', 'rto_received') or ${credited}))::int rl,
           (count(*) filter (where ${st} = 'lost'))::int ll,
           round(coalesce(sum(${w} * (o.net_revenue - ${creditedSql('o')})), 0))::bigint net,
           sum(ol.unit_cost * ol.qty - ${restockedCost})::bigint cogs,
           round(sum(${w} * o.forward_shipping))::bigint fwd, round(sum(${w} * o.rto_shipping))::bigint rto, round(sum(${w} * o.courier_cod_fee))::bigint codfee,
           round(coalesce(sum(${w} * o.gateway_fee), 0))::bigint gw, round(coalesce(sum(${w} * ${feeBaseSql('o', now)}), 0))::bigint base
      from order_lines ol
      join ${orders} o on o.tenant_id = ol.tenant_id and o.id = ol.order_id
      left join products p on p.tenant_id = ol.tenant_id and p.id = ol.product_id
      left join shipments s on s.tenant_id = o.tenant_id and s.order_id = o.id and s.ended_at is null
     where ${win} and ${st} in ('delivered', 'rto', 'rto_received', 'lost')
     group by ${key}, p.title, 3, 4, 5, 6, 7, (ol.unit_cost is null), (o.forward_shipping is null), (o.rto_shipping is null), (o.courier_cod_fee is null)`
}

function linesOf(rows: readonly LineRow[], history: readonly { feeBps: number }[], est: ReturnType<typeof estimateOf>): Line[] {
  const by = new Map<string, { name: string; rows: LineRow[] }>()
  for (const r of rows) {
    const k = r.key ?? 'removed'
    const e = by.get(k) ?? { name: r.key ? r.name : 'Removed products', rows: [] }
    e.rows.push(r); by.set(k, e)
  }
  return [...by].map(([id, e]) => {
    // The weight stands in for the order count in keptOf (how much of each order this product is).
    const groups: KeptGroup[] = groupsOf(e.rows.map((r) => ({ ...r, n: r.w })), history)
    const k = keptOf(groups, est)
    return { id, name: e.name, delivered: sum(e.rows, 'dl'), returned: sum(e.rows, 'rl'), lost: sum(e.rows, 'll'), kept: k.kept,
      leftOut: e.rows.filter((r) => r.cogs === null).reduce((a, r) => a + r.n, 0) }
  }).sort((a, b) => a.kept - b.kept)
}

const sum = (rows: readonly LineRow[], k: 'dl' | 'rl' | 'll') => rows.reduce((a, r) => a + r[k], 0)
