import 'server-only'
import { eq, sql } from 'drizzle-orm'
import { orders } from '@/lib/db/schema-orders'
import { shopSettings } from '@/lib/db/schema'
import { stateSql } from '@/lib/db/order-predicates'
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

const WINDOW_DAYS = 180
const outcomeIn = (now: Date) => sql`${stateSql(now, 'o')} in ('delivered', 'rto', 'rto_received', 'lost')`
const backIn = (now: Date) => sql`${stateSql(now, 'o')} in ('rto', 'rto_received')`
const since = (now: Date) => sql`${new Date(now.getTime() - WINDOW_DAYS * 86_400_000).toISOString()}::timestamptz`

/** One PIN code's counts, inside the order page's own transaction. */
export async function pinIn(tx: Tx, tenantId: string, pincode: string, now: Date): Promise<PinCount | null> {
  if (!/^\d{6}$/.test(pincode)) return null
  const [r] = await tx.execute<PinCount>(sql`
    select count(*)::int outcomes, (count(*) filter (where ${backIn(now)}))::int back from ${orders} o
     where o.tenant_id = ${tenantId} and o.pincode = ${pincode} and o.placed_at >= ${since(now)} and o.cancelled_at is null and ${outcomeIn(now)}`)
  return r ?? null
}

/** Settings › Pay on delivery: "From your returns: add 302012 (3 of 12 came back)", or nothing. The pick is pure. */
export async function pinSuggestionFor(tenantId: string, now: Date): Promise<PinSuggestion | null> {
  return withTenant(tenantId, async (tx) => {
    const [[store], pins, [shop]] = await Promise.all([
      tx.execute<PinCount>(sql`
        select count(*)::int outcomes, (count(*) filter (where ${backIn(now)}))::int back from ${orders} o
         where o.tenant_id = ${tenantId} and o.placed_at >= ${since(now)} and o.cancelled_at is null and ${outcomeIn(now)}`),
      tx.execute<{ pin: string; outcomes: number; back: number }>(sql`
        select o.pincode pin, count(*)::int outcomes, (count(*) filter (where ${backIn(now)}))::int back from ${orders} o
         where o.tenant_id = ${tenantId} and o.placed_at >= ${since(now)} and o.cancelled_at is null and ${outcomeIn(now)} and o.pincode ~ '^[1-9][0-9]{5}$'
         group by o.pincode having count(*) >= ${MIN_OUTCOMES}`),
      tx.select({ blocked: shopSettings.codBlockedPincodes }).from(shopSettings).where(eq(shopSettings.tenantId, tenantId)),
    ])
    return store ? pickPinToBlock([...pins], store, shop?.blocked ?? []) : null
  })
}
