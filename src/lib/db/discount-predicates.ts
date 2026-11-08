import 'server-only'
import { sql, type SQL } from 'drizzle-orm'
import type { Tx } from './index'
import { discountUseSql } from './order-predicates'
import { orderDiscounts } from './schema-discounts'
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

/** Whether the order at `o` is using the order_discounts row at `od` (its class decides the rule). */
export const useOfRowSql = (now: Date, od = 'od', o = 'o'): SQL =>
  sql`(case when ${c(od, 'class')} = 'payment' then ${discountUseSql(now, 'payment', o)} else ${discountUseSql(now, 'order', o)} end)`

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
