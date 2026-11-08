import 'server-only'
import { sql, type SQL } from 'drizzle-orm'
import { discountUseSql } from './order-predicates'

// =============================================================================
// FILE: src/lib/db/discount-predicates.ts
//
// AN OFFER'S STATE AND ITS USES IN SQL — the one place a query tests them. They mirror
// src/domains/checkout/offer-status.ts (status) and orders/order-state.ts usesDiscount (uses).
// Each takes the alias the table has in the query.
// =============================================================================

const c = (a: string, col: string) => sql.raw(`${a}.${col}`)
const ts = (d: Date) => sql`${d.toISOString()}::timestamptz`

/** offerStatus() === 'live': started, not paused or ended, inside its window. */
export const liveDiscountSql = (now: Date, a = '"discounts"'): SQL =>
  sql`(${c(a, 'started_at')} is not null and ${c(a, 'ended_at')} is null and ${c(a, 'paused_at')} is null and ${c(a, 'starts_at')} <= ${ts(now)}
    and (${c(a, 'ends_at')} is null or ${c(a, 'ends_at')} > ${ts(now)}))`

/** Whether the order at `o` is using the order_discounts row at `od` (its class decides the rule). */
export const useOfRowSql = (now: Date, od = 'od', o = 'o'): SQL =>
  sql`(case when ${c(od, 'class')} = 'payment' then ${discountUseSql(now, 'payment', o)} else ${discountUseSql(now, 'order', o)} end)`
