import 'server-only'
import { sql, type SQL } from 'drizzle-orm'
import { SHIP_TABS, type OfferWay, type OrderState, type QueueTab } from '@/domains/orders/order-state'
import { ASSUME_DELIVERED_DAYS } from '@/domains/orders/outcomes'
import { placedRange, type OrderFilters } from '@/domains/orders/filters'
import { orderLines, orders, shipments } from '@/lib/db/schema-orders'

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
  ndrAt: orders.ndrAt, deliveredAt: orders.deliveredAt, lostAt: orders.lostAt, rtoInitiatedAt: orders.rtoInitiatedAt, rtoDeliveredAt: orders.rtoDeliveredAt,
  stockShort: sql<boolean>`${stockShortSql()}`.mapWith(Boolean),
}
const ts = (d: Date) => sql`${d.toISOString()}::timestamptz`

/** Paid, but an in-stock line's stock was never taken (it sold out before the capture). */
export function stockShortSql(a = '"orders"'): SQL {
  return sql`(${c(a, 'paid_at')} is not null and exists (
  select 1 from order_lines sl where sl.tenant_id = ${c(a, 'tenant_id')} and sl.order_id = ${c(a, 'id')} and sl.kind = 'in_stock' and sl.stock_taken_at is null and sl.removed_at is null))`
}

/** orderState() in SQL. */
export const stateSql = (now: Date, a = '"orders"'): SQL<OrderState> => sql<OrderState>`(case
  when ${c(a, 'rto_delivered_at')} is not null then 'rto_received'
  when ${c(a, 'rto_initiated_at')} is not null then 'rto'
  when ${c(a, 'delivered_at')} is not null then 'delivered'
  when ${c(a, 'lost_at')} is not null then 'lost'
  when ${c(a, 'cancelled_at')} is not null then 'cancelled'
  when ${c(a, 'ndr_at')} is not null then 'ndr'
  when ${c(a, 'shipped_at')} is not null then 'shipped'
  when ${c(a, 'packed_at')} is not null then 'packed'
  when ${c(a, 'paid_at')} is not null then (case when ${stockShortSql(a)} then 'refund_due' when ${c(a, 'held_at')} is not null then 'held' else 'paid' end)
  when ${c(a, 'payment_method')} = 'prepaid' and ${c(a, 'switched_to_cod_at')} is null then (case when ${c(a, 'pay_by')} > ${ts(now)} then 'awaiting_payment' else 'payment_abandoned' end)
  when ${c(a, 'held_at')} is not null then 'held'
  when ${c(a, 'confirmed_at')} is not null then 'confirmed'
  else 'unconfirmed' end)`

/** enteredAt() in SQL: when an order entered its tab; null outside the work tabs and the four shipping tabs. */
export const enteredAtSql = (now: Date, a = '"orders"'): SQL<Date | null> => sql<Date | null>`(case ${stateSql(now, a)}
  when 'unconfirmed' then coalesce(${c(a, 'switched_to_cod_at')}, ${c(a, 'placed_at')})
  when 'refund_due' then ${c(a, 'paid_at')} when 'paid' then ${c(a, 'paid_at')}
  when 'confirmed' then ${c(a, 'confirmed_at')}
  when 'held' then ${c(a, 'held_at')}
  when 'packed' then ${c(a, 'packed_at')} when 'shipped' then ${c(a, 'shipped_at')}
  when 'ndr' then ${c(a, 'ndr_at')} when 'rto' then ${c(a, 'rto_initiated_at')} end)`

const IN: Record<Exclude<QueueTab, 'all'>, OrderState[]> = {
  to_confirm: ['unconfirmed', 'refund_due'], to_pack: ['confirmed', 'paid'], on_hold: ['held'], not_paid: ['awaiting_payment', 'payment_abandoned'],
  to_ship: ['packed'], on_the_way: ['shipped'], couldnt_deliver: ['ndr'], coming_back: ['rto'],
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

/**
 * Every order a shipping tab can hold (packed, shipped, couldn't deliver, coming back): not back at the shop, and
 * either a return started (it outranks delivered and cancelled in stateSql) or not delivered, not cancelled and at
 * least packed. Said first for the partial index orders_inflight_idx (Ship S·0), as openSql is for the work tabs; the
 * text matches the index's predicate exactly. It changes no result: the parity test holds it.
 */
export const inFlightSql = (a = '"orders"'): SQL => sql.raw(`${a}."rto_delivered_at" is null and (${a}."rto_initiated_at" is not null or (${a}."delivered_at" is null and ${a}."lost_at" is null and ${a}."cancelled_at" is null and (${a}."packed_at" is not null or ${a}."shipped_at" is not null or ${a}."ndr_at" is not null)))`)

const SHIP = new Set<string>(SHIP_TABS)
/** queueTab() in SQL; 'all' is every placed order. */
export const inTabSql = (tab: QueueTab, now: Date, a = '"orders"'): SQL =>
  tab === 'all' ? placedSql(a) : sql`(${SHIP.has(tab) ? inFlightSql(a) : openSql(a)} and ${stateSql(now, a)} in (${list(IN[tab])}))`

/**
 * isPlaced(): not an online order still waiting for, or never given, its payment. Cancelled orders count as placed.
 * KNOWN COPY: app_admin_offer_totals (drizzle/0042), and the unread app_admin_order_counts (drizzle/0006), state it in
 * their SQL bodies, where this module cannot reach; change all together (impact review 2026-11-07).
 */
export const placedSql = (a = '"orders"'): SQL =>
  sql`not (${c(a, 'payment_method')} = 'prepaid' and ${c(a, 'paid_at')} is null and ${c(a, 'switched_to_cod_at')} is null)`

/** The order's open shipment's provider ('self', 'shiprocket'), or null before it shipped: the one SQL for it (Ship S·0). */
export const openShipmentProviderSql = (a = '"orders"'): SQL<'self' | 'shiprocket' | null> =>
  sql<'self' | 'shiprocket' | null>`(select s.provider from ${shipments} s where s.tenant_id = ${c(a, 'tenant_id')} and s.order_id = ${c(a, 'id')} and s.ended_at is null limit 1)`

/** currentMethod() in SQL: online once paid, COD once switched (unless paid after all), else as chosen. */
export const currentMethodSql = (a = '"orders"'): SQL<'cod' | 'prepaid'> => sql<'cod' | 'prepaid'>`(case
  when ${c(a, 'paid_at')} is not null then 'prepaid' when ${c(a, 'switched_to_cod_at')} is not null then 'cod'
  when ${c(a, 'payment_method')} = 'prepaid' then 'prepaid' else 'cod' end)`

/** paymentKind() in SQL: 'paid' once paid, else 'cod' or 'unpaid' by the current method. */
export const paymentKindSql = (a = '"orders"'): SQL<'cod' | 'paid' | 'unpaid'> => sql<'cod' | 'paid' | 'unpaid'>`(case
  when ${c(a, 'paid_at')} is not null then 'paid' when ${currentMethodSql(a)} = 'cod' then 'cod' else 'unpaid' end)`

/** isHolding(): an unpaid online order inside pay_by, not cancelled, holds its stock. */
export const holdingSql = (now: Date, a = '"orders"'): SQL =>
  sql`(${c(a, 'payment_method')} = 'prepaid' and ${c(a, 'paid_at')} is null and ${c(a, 'switched_to_cod_at')} is null and ${c(a, 'cancelled_at')} is null and ${c(a, 'pay_by')} > ${ts(now)})`

/** isStanding(): placed and not cancelled — its lines still count against stock and pre-order caps. */
export const standingSql = (a = '"orders"'): SQL => sql`(${c(a, 'cancelled_at')} is null and ${placedSql(a)})`

/**
 * Another order from this phone in this shop that is standing or holding: "has ordered here before". The ONE rule
 * behind a first-order offer (placement, and again on a payment retry) and O·3's new-vs-repeat buyer. `except`
 * leaves an order out (the one being judged); `before` counts only orders placed before that moment.
 */
export const priorOrderSql = (now: Date, tenantId: string, phone: SQL | string, o: { except?: SQL | string; before?: SQL } = {}): SQL =>
  sql`exists (select 1 from ${orders} po where po.tenant_id = ${tenantId} and po.phone = ${phone} and po.phone <> ''
    and (${standingSql('po')} or ${holdingSql(now, 'po')})${o.except ? sql` and po.id <> ${o.except}` : sql``}${o.before ? sql` and po.placed_at < ${o.before}` : sql``})`

/** What Razorpay was asked for (checkout.onlineTotal), as a number column for StoredOrder.onlineTotal. */
export const onlineTotalCol = sql<number | null>`(${orders.checkout}->>'onlineTotal')::bigint`.mapWith((v) => (v == null ? null : Number(v)))

/**
 * usesDiscount() in SQL: whether the order at `a` is using an offer row of `way` (limits, budgets, ₹ given).
 * KNOWN COPY: app_admin_offer_totals (drizzle/0107) restates it; its int test holds it to discountUses.
 */
export const discountUseSql = (now: Date, way: OfferWay, a = '"orders"'): SQL =>
  way === 'prepaid'
    ? sql`((${c(a, 'paid_at')} is not null and ${c(a, 'cancelled_at')} is null) or ${holdingSql(now, a)})`
    : way === 'cod'
      ? sql`((${standingSql(a)} and ${c(a, 'paid_at')} is null) or ${holdingSql(now, a)})`
      : sql`(${standingSql(a)} or ${holdingSql(now, a)})`

/**
 * Units of the variant at `variantCol` owed to pre-orders not yet packed: stock that arrives for them is not for
 * sale. Read by checkout (variantRows) and the product page (storefront), so the two agree (impact review 2026-11-07).
 */
export const owedSql = (tenantId: string, now: Date, variantCol = '"variants"."id"'): SQL<number> => sql<number>`(select coalesce(sum(l.qty), 0)::int from ${orderLines} l join ${orders} o on o.id = l.order_id and o.tenant_id = l.tenant_id
  where l.tenant_id = ${tenantId} and l.variant_id = ${sql.raw(variantCol)} and l.kind = 'preorder' and l.stock_taken_at is null and l.removed_at is null and o.packed_at is null and o.shipped_at is null
    and (${standingSql('o')} or ${holdingSql(now, 'o')}))`

/**
 * An items edit waiting for the shopper's payment (order edit OE·2): asked, not paid, not dropped, its order not
 * cancelled. Its new in-stock pieces are held meanwhile (order_edit_lines.held). `e` is order_edits' alias, `o` the
 * order's.
 */
export const editWaitingSql = (e: string, o: string): SQL => sql.raw(`(${e}.asked is not null and ${e}.paid_at is null and ${e}.dropped_at is null and ${o}.cancelled_at is null)`)

/** Units of the variant at `variantCol` held by edits waiting for payment (from the held-pieces index). */
const editHeldSql = (tenantId: string, variantCol: string): SQL => sql`(select coalesce(sum(h.held), 0)::int from order_edit_lines h
  join order_edits e on e.tenant_id = h.tenant_id and e.id = h.edit_id join ${orders} eo on eo.tenant_id = e.tenant_id and eo.id = e.order_id
  where h.tenant_id = ${tenantId} and h.variant_id = ${sql.raw(variantCol)} and h.held > 0 and ${editWaitingSql('e', 'eo')})`

/**
 * Units of the variant at `variantCol` held by unpaid online orders inside their pay_by (isHolding), and by items edits
 * waiting for the shopper's payment (OE·2): not for sale while held. Read by checkout (variantRows) and the product page
 * (storefront), so "Only N left" and "Sold out" are the stock checkout sells: stock − held − owed (shopper batch
 * 2026-11-12).
 */
export const heldSql = (tenantId: string, now: Date, variantCol = '"variants"."id"'): SQL<number> => sql<number>`((select coalesce(sum(l.qty), 0)::int from ${orderLines} l join ${orders} o on o.id = l.order_id and o.tenant_id = l.tenant_id
  where l.tenant_id = ${tenantId} and l.variant_id = ${sql.raw(variantCol)} and l.kind = 'in_stock' and l.removed_at is null and ${holdingSql(now, 'o')}) + ${editHeldSql(tenantId, variantCol)})`

/**
 * heldSql for a whole shop at once: units held per variant (only variants something holds). The shop's cached pages
 * read this, one statement from the holds index, instead of heldSql per variant: 3,000 variants at the 10× seed cost
 * 265 ms that way (every variant walked every hold), this one well under 10 ms. Same rule (holdingSql, in-stock lines;
 * and the pieces edits waiting for payment hold, from their own partial index).
 */
export async function heldByVariant(tx: { execute: (q: SQL) => PromiseLike<unknown> }, tenantId: string, now: Date): Promise<Map<string, number>> {
  const rows = await tx.execute(sql`select v, sum(n)::int n from (
    select l.variant_id v, l.qty n from ${orders} o join ${orderLines} l on l.tenant_id = o.tenant_id and l.order_id = o.id
     where o.tenant_id = ${tenantId} and ${holdingSql(now, 'o')} and l.kind = 'in_stock' and l.removed_at is null and l.variant_id is not null
    union all
    select h.variant_id v, h.held n from order_edit_lines h join order_edits e on e.tenant_id = h.tenant_id and e.id = h.edit_id join ${orders} eo on eo.tenant_id = e.tenant_id and eo.id = e.order_id
     where h.tenant_id = ${tenantId} and h.held > 0 and h.variant_id is not null and ${editWaitingSql('e', 'eo')}) x group by v`) as { v: string; n: number }[]
  return new Map(rows.map((r) => [r.v, Number(r.n)]))
}

/**
 * Where a standing or holding order stands for Analytics (A·1): its outcome, on the way, or not sent yet. Straight
 * from the outcome timestamps, in stateSql's ranking (a return outranks delivered, delivered outranks lost; shipped or a
 * failed attempt is on the way): the full state expression, with its refund-due subquery, cost four evaluations per
 * order at 10×. Only for orders that are not cancelled (the caller's filter); a parity int test holds it to stateSql.
 */
export const stageSql = (a = '"orders"'): SQL<'delivered' | 'rto' | 'lost' | 'on_the_way' | 'not_sent'> => sql`(case
  when ${c(a, 'rto_delivered_at')} is not null or ${c(a, 'rto_initiated_at')} is not null then 'rto'
  when ${c(a, 'delivered_at')} is not null then 'delivered'
  when ${c(a, 'lost_at')} is not null then 'lost'
  when ${c(a, 'ndr_at')} is not null or ${c(a, 'shipped_at')} is not null then 'on_the_way'
  else 'not_sent' end)`

/**
 * The moment an order's fee RATE is decided: when it shipped (owner, 2026-11-08), else its billable moment. Twin of
 * feeForOrder's `rateAt` (src/domains/plans/entitlements.ts). Billing reads only shipped orders, so there it is shipped_at.
 */
export const feeRateAtSql = (a = '"orders"'): SQL<Date | null> => sql<Date | null>`coalesce(${c(a, 'shipped_at')}, ${billableAtSql(a)})`

/**
 * The plan-fee bucket at an order's rate moment (`feeRateAtSql`, the one rule): k = the k-th of
 * `feeChanges` (the plan versions' start times, oldest first), 0 none; the same pick as `feeForOrder`
 * (domains/plans/entitlements.ts), made per group in SQL so ₹ kept never reads one row per order. Only a delivered
 * order pays a fee here (an order assumed delivered after 30 days is billed but has no outcome to show yet).
 */
export function feeBucketSql(a: string, feeChanges: readonly Date[]): SQL<number> {
  if (!feeChanges.length) return sql<number>`0`
  // As feeForOrder: billable before any plan pays nothing; shipped before the first plan takes the first plan's rate.
  const first = sql`${feeChanges[0]!.toISOString()}::timestamptz`
  const rateAt = sql`greatest(${feeRateAtSql(a)}, ${first})`
  // Only a delivered order pays a fee: delivered and no return (stateSql's ranking), straight from its columns.
  const delivered = sql`(${c(a, 'delivered_at')} is not null and ${c(a, 'rto_initiated_at')} is null and ${c(a, 'rto_delivered_at')} is null)`
  // A plain CASE over the few plan changes, latest first (a per-row unnest cost ~40% of the read at 10×).
  const arms = [...feeChanges.entries()].reverse().map(([i, d]) => sql`when ${rateAt} >= ${d.toISOString()}::timestamptz then ${sql.raw(String(i + 1))}`)
  return sql<number>`(case when ${delivered} and ${billableAtSql(a)} >= ${first} then (case ${sql.join(arms, sql` `)} else 0 end) else 0 end)`
}

/**
 * What credit notes after delivery gave back (returned items, a discount agreed before the sale, goodwill), taxable
 * value: it comes off what the order earned, in ₹ kept everywhere (keptSql, Analytics' windowSql). A reversal is the
 * outcome itself. A returned piece's cost comes back only when it was put back in stock (`cogsSql`); a return not
 * restocked keeps its cost (hypothesis H-resale in frata-unit-economics; unit-economics review 2026-11-09).
 */
export const creditedSql = (a: string) =>
  sql`(select coalesce(sum(cn.taxable), 0) from credit_notes cn where cn.tenant_id = ${c(a, 'tenant_id')} and cn.order_id = ${c(a, 'id')} and cn.kind in ('return', 'discount', 'goodwill'))`

/**
 * The taxable value of the order's items returned on credit notes issued before `before` (kind 'return' only: a discount
 * or goodwill note is not a return). Owner, 2026-11-12: a returned item isn't billable, so Frrata's fee base is the
 * order's merchandise net less this (billing draft), and a return after billing gives its fee back.
 * Only a note issued within the shop's return window plus 15 days of delivery (delivered, or assumed delivered 30 days
 * after shipping) moves the fee: nothing ties a return note to goods coming back, and a later note is still a valid GST
 * document but no longer a return for the fee (unit-economics review 2026-11-12, the abuse path).
 */
export const returnedSql = (a: string, before: Date) =>
  sql`(select coalesce(sum(cn.taxable), 0) from credit_notes cn where cn.tenant_id = ${c(a, 'tenant_id')} and cn.order_id = ${c(a, 'id')} and cn.kind = 'return' and cn.issued_at < ${before.toISOString()}::timestamptz
    and cn.issued_at <= coalesce(${c(a, 'delivered_at')}, ${c(a, 'shipped_at')} + interval '30 days') + make_interval(days => coalesce(${c(a, 'return_days')}, 0) + 15))`

/**
 * The goods' cost of the pieces a return put back in stock (credit_note_lines.restocked_qty × the line's own unit cost,
 * as stored at placement): back on sale, so no longer a cost of this order. A line with no unit cost adds nothing back
 * (never a guessed cost; its order's COGS is unknown anyway). Only `return` notes restock (issueCredit).
 */
export const restockedCostSql = (a: string) =>
  sql`(select coalesce(sum(l.restocked_qty * ol.unit_cost), 0) from credit_notes cn
    join credit_note_lines l on l.tenant_id = cn.tenant_id and l.credit_note_id = cn.id
    join order_lines ol on ol.tenant_id = l.tenant_id and ol.id = l.order_line_id
   where cn.tenant_id = ${c(a, 'tenant_id')} and cn.order_id = ${c(a, 'id')} and cn.kind = 'return' and l.restocked_qty > 0)`

/**
 * A return whose stock was put back: its came-back event recorded it (`reason = 'restocked'`, markCameBack in
 * src/lib/orders/outcomes.ts, the one writer) and was not undone. The ONE SQL for it: profit.ts loses a return's COGS
 * only when this is false (keptSql and Analytics alike). Asked only of an order whose return started (cheap elsewhere);
 * reads order_events by (tenant_id, order_id).
 */
export const rtoRestockedSql = (a: string): SQL<boolean> => sql<boolean>`(${c(a, 'rto_initiated_at')} is not null and exists (
  select 1 from order_events re where re.tenant_id = ${c(a, 'tenant_id')} and re.order_id = ${c(a, 'id')} and re.kind = 'rto' and re.reason = 'restocked'
     and not exists (select 1 from order_events ru where ru.tenant_id = re.tenant_id and ru.order_id = re.order_id and ru.undoes = re.id)))`

/** The order's COGS for ₹ kept: as placed, less what returns put back in stock; null while unknown. keptSql and Analytics alike. */
export const cogsSql = (a: string) => sql`(${c(a, 'cogs')} - ${restockedCostSql(a)})`

/**
 * ₹ KEPT, GROUPED (Analytics A·1; speed review: never one row per order). The expressions `keptOf`
 * (src/domains/orders/kept.ts) groups by, and what it sums: an order with an outcome (delivered, came back, lost) by
 * its outcome, the open shipment's provider, COD or not, which costs it knows, and the plan-fee bucket at its rate
 * moment (when it shipped) (`feeChanges`: the plan versions' start times, oldest first; bucket k means the k-th version, 0 none, as
 * `feeForOrder`). Offers and Analytics both read it, so their ₹ kept agree.
 */
/** Frrata's fee base for ₹ kept: what the shopper kept (merchandise less returns within the window), never below 0.
 * keptSql and Analytics alike (impact review 2026-11-12: Analytics charged the fee on returned pieces). */
export const feeBaseSql = (a: string, now: Date) => sql`greatest(${c(a, 'merchandise_net')} - ${returnedSql(a, now)}, 0)`

export function keptSql(now: Date, a: string, feeChanges: readonly Date[], providerCol?: SQL) {
  const st = stateSql(now, a)
  const outcome = sql<'delivered' | 'rto' | 'lost'>`(case when ${st} = 'delivered' then 'delivered' when ${st} in ('rto', 'rto_received') then 'rto' else 'lost' end)`
  // The open shipment's provider: a joined column when the caller has one (speed review: never per row at scale).
  const provider = providerCol ?? openShipmentProviderSql(a)
  const cod = sql<boolean>`(${currentMethodSql(a)} = 'cod')`
  const bucket = feeBucketSql(a, feeChanges)
  const credited = creditedSql(a)
  return {
    /** Only orders with an outcome. */
    where: sql`${st} in ('delivered', 'rto', 'rto_received', 'lost')`,
    /** The group's columns: outcome, provider, cod, bucket, restocked, then the sums. */
    columns: sql`${outcome} outcome, ${provider} provider, ${cod} cod, ${bucket} bucket, ${rtoRestockedSql(a)} restocked, count(*)::int n,
      coalesce(sum(${c(a, 'net_revenue')} - ${credited}), 0)::bigint net, sum(${cogsSql(a)})::bigint cogs, sum(${c(a, 'forward_shipping')})::bigint fwd,
      sum(${c(a, 'rto_shipping')})::bigint rto, sum(${c(a, 'courier_cod_fee')})::bigint codfee, coalesce(sum(${c(a, 'gateway_fee')}), 0)::bigint gw,
      coalesce(sum(${feeBaseSql(a, now)}), 0)::bigint base`,
    /** Group by these, after `lead` key columns of the caller's own placed first: the five group columns by position,
     * and known costs apart from unknown, so a sum is null only when all of its orders lack it. */
    groupBy: (lead = 0) => sql.raw(`${[1, 2, 3, 4, 5].map((i) => i + lead).join(', ')}, (${a}.cogs is null), (${a}.forward_shipping is null), (${a}.rto_shipping is null), (${a}.courier_cod_fee is null)`),
  }
}
/** A row of keptSql, as postgres returns it. */
export type KeptRow = { outcome: 'delivered' | 'rto' | 'lost'; provider: 'self' | 'shiprocket' | null; cod: boolean; bucket: number; restocked: boolean; n: number; net: string; cogs: string | null; fwd: string | null; rto: string | null; codfee: string | null; gw: string; base: string }
/**
 * billableAt() in SQL (src/domains/orders/outcomes.ts): when an order became a delivered order for Frrata's fee —
 * delivered, or shipped + 30 days, whichever came first; null after a return started, when lost without delivery,
 * or when never shipped. The parity test holds the two equal.
 */
export const billableAtSql = (a = '"orders"'): SQL<Date | null> => sql<Date | null>`(case
  when ${c(a, 'rto_initiated_at')} is not null then null
  when ${c(a, 'delivered_at')} is not null then least(${c(a, 'delivered_at')}, ${c(a, 'shipped_at')} + interval '${sql.raw(String(ASSUME_DELIVERED_DAYS))} days')
  when ${c(a, 'shipped_at')} is null or ${c(a, 'lost_at')} is not null then null
  else ${c(a, 'shipped_at')} + interval '${sql.raw(String(ASSUME_DELIVERED_DAYS))} days' end)`

/** How many pieces an order holds now (removed lines left out): the queue's and Home's "3 items" (one copy, impact
 * review N1). Tenant-scoped inside, as every subquery here. */
export const orderItemsSql = (tenantId: string) =>
  sql<number>`(select coalesce(sum(l.qty), 0)::int from ${orderLines} l where l.order_id = "orders"."id" and l.tenant_id = ${tenantId} and l.removed_at is null)`

/**
 * The Orders list's filters in SQL (Neel N1c; what each means: src/domains/orders/filters.ts). Payment reads the same
 * rule as the Payment column (currentMethodSql, paid_at); State is the delivery state as stored; Placed is IST days
 * [from, before); Total is the order's total in paise. Null when there is nothing to filter.
 */
export function filterSql(f: OrderFilters, now: Date, a = '"orders"'): SQL | null {
  const parts: SQL[] = []
  // One parameter array (`= any`): the rule is paymentKindSql's, and the values never reach SQL as text.
  if (f.pay?.length) parts.push(sql`${paymentKindSql(a)} = any(${`{${f.pay.join(',')}}`}::text[])`)
  if (f.states?.length) parts.push(sql`${c(a, 'state')} in (${sql.join(f.states.map((s) => sql`${s}`), sql`, `)})`)
  const { from, before } = placedRange(f.placed, now)
  if (from) parts.push(sql`${c(a, 'placed_at')} >= ${ts(from)}`)
  if (before) parts.push(sql`${c(a, 'placed_at')} < ${ts(before)}`)
  if (f.total?.min !== undefined) parts.push(sql`${c(a, 'total')} >= ${f.total.min}`)
  if (f.total?.max !== undefined) parts.push(sql`${c(a, 'total')} <= ${f.total.max}`)
  return parts.length ? sql`(${sql.join(parts, sql` and `)})` : null
}
