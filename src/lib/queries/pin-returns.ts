import 'server-only'
import { eq, sql } from 'drizzle-orm'
import { orders } from '@/lib/db/schema-orders'
import { shopSettings } from '@/lib/db/schema'
import { cameBackSql, outcomeSql } from '@/lib/db/order-predicates'
import { withTenant } from '@/lib/db/tenant'
import type { Tx } from '@/lib/db'
import { MIN_OUTCOMES, pickPinToBlock, type PinSuggestion } from '@/domains/orders/pin-suggest'

// =============================================================================
// FILE: src/lib/queries/pin-returns.ts — HOW OFTEN A PIN CODE'S ORDERS CAME BACK (Neel N2b; plan: one module, one
// window). The order page's PIN line and Settings › Pay on delivery's one suggestion read the same counts: orders placed
// in the last 180 days, not cancelled, that reached an outcome (delivered, came back, lost). Counts only: never another
// order's name, address or ₹. Every query names tenant_id inside withTenant.
// =============================================================================

export type PinCount = { outcomes: number; back: number }

/** One window and one pair of predicates for "came back" here, the order page's couriers and the PIN line alike. */
export const WINDOW_DAYS = 180
export const outcomeIn = (_now: Date) => outcomeSql('o')
export const backIn = (_now: Date) => cameBackSql('o')
export const since = (now: Date) => sql`${new Date(now.getTime() - WINDOW_DAYS * 86_400_000).toISOString()}::timestamptz`

/** One PIN code's counts, inside the order page's own transaction. */
export async function pinIn(tx: Tx, tenantId: string, pincode: string, now: Date): Promise<PinCount | null> {
  if (!/^[1-9]\d{5}$/.test(pincode)) return null
  const [r] = await tx.execute<PinCount>(sql`
    select count(*)::int outcomes, (count(*) filter (where ${backIn(now)}))::int back from ${orders} o
     where o.tenant_id = ${tenantId} and o.pincode = ${pincode} and o.placed_at >= ${since(now)} and o.cancelled_at is null and ${outcomeIn(now)}`)
  return r ?? null
}

/** Settings › Pay on delivery: "From your returns: add 302012 (3 of 12 came back)", or nothing. The pick is pure. */
export async function pinSuggestionFor(tenantId: string, now: Date): Promise<PinSuggestion | null> {
  return withTenant(tenantId, async (tx) => {
    // One pass over the window (speed review): grouped by PIN code, summed for the store, filtered for the list.
    const [rows, [shop]] = await Promise.all([
      tx.execute<{ pin: string | null; outcomes: number; back: number }>(sql`
        with g as (select o.pincode pin, count(*)::int outcomes, (count(*) filter (where ${backIn(now)}))::int back from ${orders} o
                    where o.tenant_id = ${tenantId} and o.placed_at >= ${since(now)} and o.cancelled_at is null and ${outcomeIn(now)}
                    group by o.pincode)
        select null pin, coalesce(sum(outcomes), 0)::int outcomes, coalesce(sum(back), 0)::int back from g
        union all
        select pin, outcomes, back from g where outcomes >= ${MIN_OUTCOMES} and pin ~ '^[1-9][0-9]{5}$'`),
      tx.select({ blocked: shopSettings.codBlockedPincodes }).from(shopSettings).where(eq(shopSettings.tenantId, tenantId)),
    ])
    const store = rows.find((r) => r.pin === null)
    const pins = rows.filter((r): r is { pin: string; outcomes: number; back: number } => r.pin !== null)
    return store ? pickPinToBlock(pins, store, shop?.blocked ?? []) : null
  })
}
