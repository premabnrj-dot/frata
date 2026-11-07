import 'server-only'
import { sql, type SQL } from 'drizzle-orm'
import type { OrderState, QueueTab } from '@/domains/orders/order-state'
import { orderLines, orders } from '@/lib/db/schema-orders'

// =============================================================================
// FILE: src/lib/db/order-predicates.ts
//
// AN ORDER'S STATE IN SQL — the one place a query tests it (frata-architecture
// § Record actions). It mirrors src/domains/orders/order-state.ts line for
// line; the parity test (__tests__/order-predicates.int.test.ts) runs both on
// the same rows of a real Postgres and fails on any difference. A query never
// restates a timestamp rule: it uses one of these.
//
// Each takes the alias the orders table has in the query (`"orders"` when it
// is the FROM table, `o` in a subquery).
// =============================================================================

const c = (a: string, col: string) => sql.raw(`${a}.${col}`)

/** Every column orderState() reads, for a select on "orders" (OrderMoments requires them all). */
export const momentColumns = {
  placedAt: orders.placedAt, paymentMethod: orders.paymentMethod, payBy: orders.payBy, paidAt: orders.paidAt, switchedToCodAt: orders.switchedToCodAt,
  confirmedAt: orders.confirmedAt, heldAt: orders.heldAt, packedAt: orders.packedAt, cancelledAt: orders.cancelledAt, shippedAt: orders.shippedAt,
  ndrAt: orders.ndrAt, deliveredAt: orders.deliveredAt, rtoInitiatedAt: orders.rtoInitiatedAt, rtoDeliveredAt: orders.rtoDeliveredAt,
  stockShort: sql<boolean>`${stockShortSql()}`.mapWith(Boolean),
}
const ts = (d: Date) => sql`${d.toISOString()}::timestamptz`

/** Paid, but an in-stock line's stock was never taken (it sold out before the capture). */
export function stockShortSql(a = '"orders"'): SQL {
  return sql`(${c(a, 'paid_at')} is not null and exists (
  select 1 from order_lines sl where sl.tenant_id = ${c(a, 'tenant_id')} and sl.order_id = ${c(a, 'id')} and sl.kind = 'in_stock' and sl.stock_taken_at is null))`
}

/** orderState() in SQL. */
export const stateSql = (now: Date, a = '"orders"'): SQL<OrderState> => sql<OrderState>`(case
  when ${c(a, 'rto_delivered_at')} is not null then 'rto_received'
  when ${c(a, 'rto_initiated_at')} is not null then 'rto'
  when ${c(a, 'delivered_at')} is not null then 'delivered'
  when ${c(a, 'cancelled_at')} is not null then 'cancelled'
  when ${c(a, 'ndr_at')} is not null then 'ndr'
  when ${c(a, 'shipped_at')} is not null then 'shipped'
  when ${c(a, 'packed_at')} is not null then 'packed'
  when ${c(a, 'paid_at')} is not null then (case when ${stockShortSql(a)} then 'refund_due' when ${c(a, 'held_at')} is not null then 'held' else 'paid' end)
  when ${c(a, 'payment_method')} = 'prepaid' and ${c(a, 'switched_to_cod_at')} is null then (case when ${c(a, 'pay_by')} > ${ts(now)} then 'awaiting_payment' else 'payment_abandoned' end)
  when ${c(a, 'held_at')} is not null then 'held'
  when ${c(a, 'confirmed_at')} is not null then 'confirmed'
  else 'unconfirmed' end)`

/** enteredAt() in SQL: when an order entered its work tab; null outside To confirm, To pack and On hold. */
export const enteredAtSql = (now: Date, a = '"orders"'): SQL<Date | null> => sql<Date | null>`(case ${stateSql(now, a)}
  when 'unconfirmed' then coalesce(${c(a, 'switched_to_cod_at')}, ${c(a, 'placed_at')})
  when 'refund_due' then ${c(a, 'paid_at')} when 'paid' then ${c(a, 'paid_at')}
  when 'confirmed' then ${c(a, 'confirmed_at')}
  when 'held' then ${c(a, 'held_at')} end)`

const IN: Record<Exclude<QueueTab, 'all'>, OrderState[]> = {
  to_confirm: ['unconfirmed', 'refund_due'], to_pack: ['confirmed', 'paid'], on_hold: ['held'], not_paid: ['awaiting_payment', 'payment_abandoned'],
}
const list = (states: OrderState[]) => sql.raw(states.map((s) => `'${s}'`).join(','))

/**
 * Not yet packed, shipped, delivered, returned or cancelled: every work tab's states lie inside this (they are the
 * cases stateSql reaches only after these are all null). Said first, plainly, so the planner can use the partial
 * index orders_open_idx (drizzle/0025) instead of deriving the state of a shop's whole history (architecture
 * review 2026-11-07: tab counts took 700 ms at 50k orders). It changes no result: the parity test holds it.
 */
export const openSql = (a = '"orders"'): SQL => sql.raw(['packed_at', 'shipped_at', 'ndr_at', 'delivered_at', 'cancelled_at', 'rto_initiated_at', 'rto_delivered_at']
  .map((k) => `${a}."${k}" is null`).join(' and '))

/** queueTab() in SQL; 'all' is every placed order. */
export const inTabSql = (tab: QueueTab, now: Date, a = '"orders"'): SQL =>
  tab === 'all' ? placedSql(a) : sql`(${openSql(a)} and ${stateSql(now, a)} in (${list(IN[tab])}))`

/**
 * isPlaced(): not an online order still waiting for, or never given, its payment. Cancelled orders count (plan usage).
 * KNOWN COPY: app_admin_order_counts (drizzle/0017) states the same rule in its SQL body, where this module cannot
 * reach; change both together (impact review 2026-11-07).
 */
export const placedSql = (a = '"orders"'): SQL =>
  sql`not (${c(a, 'payment_method')} = 'prepaid' and ${c(a, 'paid_at')} is null and ${c(a, 'switched_to_cod_at')} is null)`

/** isHolding(): an unpaid online order inside pay_by, not cancelled, holds its stock. */
export const holdingSql = (now: Date, a = '"orders"'): SQL =>
  sql`(${c(a, 'payment_method')} = 'prepaid' and ${c(a, 'paid_at')} is null and ${c(a, 'switched_to_cod_at')} is null and ${c(a, 'cancelled_at')} is null and ${c(a, 'pay_by')} > ${ts(now)})`

/** isStanding(): placed and not cancelled — its lines still count against stock and pre-order caps. */
export const standingSql = (a = '"orders"'): SQL => sql`(${c(a, 'cancelled_at')} is null and ${placedSql(a)})`

/**
 * Units of the variant at `variantCol` owed to pre-orders not yet packed: stock that arrives for them is not for
 * sale. Read by checkout (variantRows) and the product page (storefront), so the two agree (impact review 2026-11-07).
 */
export const owedSql = (tenantId: string, now: Date, variantCol = '"variants"."id"'): SQL<number> => sql<number>`(select coalesce(sum(l.qty), 0)::int from ${orderLines} l join ${orders} o on o.id = l.order_id and o.tenant_id = l.tenant_id
  where l.tenant_id = ${tenantId} and l.variant_id = ${sql.raw(variantCol)} and l.kind = 'preorder' and l.stock_taken_at is null and o.packed_at is null and o.shipped_at is null
    and (${standingSql('o')} or ${holdingSql(now, 'o')}))`
