import 'server-only'
import { sql, type SQL } from 'drizzle-orm'
import type { Tx } from './index'
import { discountUseSql } from './order-predicates'
import { discountCodes, orderDiscounts } from './schema-discounts'
import { orders } from './schema-orders'

// =============================================================================
// FILE: src/lib/db/discount-predicates.ts
//
// AN OFFER'S STATE AND ITS USES IN SQL — the one place a query tests them. They mirror
// src/domains/checkout/offer-status.ts (status) and orders/order-state.ts usesDiscount (uses).
// Each takes the alias the table has in the query.
// =============================================================================

const c = (a: string, col: string) => sql.raw(`${a}.${col}`)
const ts = (d: Date) => sql`${d.toISOString()}::timestamptz`

/** offerStatus() === 'live': started, not paused, stopped or ended, inside its window. */
export const liveDiscountSql = (now: Date, a = '"discounts"'): SQL =>
  sql`(${c(a, 'started_at')} is not null and ${c(a, 'ended_at')} is null and ${c(a, 'paused_at')} is null and ${c(a, 'stopped_at')} is null and ${c(a, 'starts_at')} <= ${ts(now)}
    and (${c(a, 'ends_at')} is null or ${c(a, 'ends_at')} > ${ts(now)}))`

/** Running (the 20-offer limit, O·4): started, not ended (for good or by its end), not stopped. Paused and scheduled count. */
export const runningDiscountSql = (now: Date, a = '"discounts"'): SQL =>
  sql`(${c(a, 'started_at')} is not null and ${c(a, 'ended_at')} is null and ${c(a, 'stopped_at')} is null and (${c(a, 'ends_at')} is null or ${c(a, 'ends_at')} > ${ts(now)}))`

/**
 * How many offers a shop has running, under the shop's offers lock (held to the end of the caller's transaction):
 * the ONE count behind the limit, read by a start (console) and by Admin's resume, so two at once cannot both pass.
 */
export async function runningOffers(tx: { execute: Tx['execute'] }, tenantId: string, now: Date): Promise<number> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${'offers:' + tenantId}, 0))`)
  const [r] = await tx.execute<{ n: number }>(sql`select count(*)::int n from discounts where tenant_id = ${tenantId} and ${runningDiscountSql(now, 'discounts')}`)
  return r?.n ?? 0
}

/**
 * Whether the order at `o` is using the order_discounts row at `od` (its way decides the rule: offerWay of class and
 * method). A row an order edit took off (removed_at) is no use: its order no longer gets it.
 */
export const useOfRowSql = (now: Date, od = 'od', o = 'o'): SQL =>
  sql`(${c(od, 'removed_at')} is null and case when ${c(od, 'class')} = 'payment' or ${c(od, 'method')} = 'prepaid' then ${discountUseSql(now, 'prepaid', o)}
    when ${c(od, 'method')} = 'cod' then ${discountUseSql(now, 'cod', o)} else ${discountUseSql(now, 'both', o)} end)`

/**
 * The creator code an order (alias `o`) uses now, as `dc.label` and `dc.code` (null when none): a labelled code joined
 * through the order's own discount row while the order uses it (useOfRowSql). The one join Analytics, a source's page and
 * the order page read a creator by. An order carries at most one typed or linked code (checkout's one TypedCode), so
 * the join never repeats an order; readers that pick one row still order it (od.created_at, dc.code).
 */
export const creatorCodeJoinSql = (now: Date, o = 'o'): SQL => sql`left join (${orderDiscounts} od join ${discountCodes} dc
    on dc.tenant_id = od.tenant_id and dc.id = od.code_id and dc.label is not null)
  on od.tenant_id = ${c(o, 'tenant_id')} and od.order_id = ${c(o, 'id')} and ${useOfRowSql(now, 'od', o)}`

export type DiscountUses = { n: number; given: number; phone: number }

/**
 * The ONE count of an offer's uses (limits, budgets, the console): orders using it now, the ₹ it gave them, and how
 * many of those were this `phone`'s — optionally leaving one order out (a retry counts the others). Inside the
 * caller's tenant transaction; every row also names its tenant.
 */
export async function discountUses(tx: Tx, tenantId: string, ids: string[], now: Date, o: { phone?: string; excludeOrder?: string } = {}): Promise<Map<string, DiscountUses>> {
  if (!ids.length) return new Map()
  const rows = await tx.execute<{ id: string; n: number; given: string; phone: number }>(sql`
    select od.discount_id id, count(*)::int n, coalesce(sum(od.amount), 0)::bigint given, (count(*) filter (where o.phone = ${o.phone ?? ''}))::int phone
      from ${orderDiscounts} od join ${orders} o on o.tenant_id = od.tenant_id and o.id = od.order_id
     where od.tenant_id = ${tenantId} and od.discount_id in ${ids} and ${useOfRowSql(now)}
       ${o.excludeOrder ? sql`and od.order_id <> ${o.excludeOrder}` : sql``}
     group by od.discount_id`)
  return new Map(rows.map((r) => [r.id, { n: r.n, given: Number(r.given), phone: r.phone }]))
}

/** Whether one more use of `amount` paise fits an offer's limits (null limits: none). */
export const fits = (l: { limitTotal: number | null; limitPerPhone: number | null; budget: number | null }, u: DiscountUses | undefined, amount: number) =>
  !((l.limitTotal !== null && (u?.n ?? 0) + 1 > l.limitTotal) || (l.limitPerPhone !== null && (u?.phone ?? 0) + 1 > l.limitPerPhone)
    || (l.budget !== null && (u?.given ?? 0) + amount > l.budget))

/**
 * Used up for everyone: no order can get it any more — its total limit is reached, or its budget has not a paisa left
 * (`fits` for any phone and the smallest saving). What a shop's cached pages leave out (shopper batch 2026-11-12); a
 * per-phone limit is a shopper's own, so it never hides an offer there.
 */
export const usedUp = (l: { limitTotal: number | null; budget: number | null }, u: DiscountUses | undefined) =>
  !fits({ limitTotal: l.limitTotal, limitPerPhone: null, budget: l.budget }, u, 1)

/** The offers among `rows` that are used up now (discountUses, all time: what placement counts), in the caller's transaction. */
export async function usedUpIds(tx: Tx, tenantId: string, rows: { id: string; limitTotal: number | null; budget: number | string | null }[], now: Date): Promise<Set<string>> {
  const limited = rows.filter((r) => r.limitTotal !== null || r.budget !== null)
  if (!limited.length) return new Set()
  const used = await discountUses(tx, tenantId, limited.map((r) => r.id), now)
  return new Set(limited.filter((r) => usedUp({ limitTotal: r.limitTotal, budget: r.budget === null ? null : Number(r.budget) }, used.get(r.id))).map((r) => r.id))
}
