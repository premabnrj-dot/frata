import 'server-only'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { MIN_FOR_MEDIAN, type RiskFacts } from '@/domains/orders/risk'
import { placedSql, standingSql } from '@/lib/db/order-predicates'
import { pincodes } from '@/lib/db/schema'
import { orders } from '@/lib/db/schema-orders'
import { withTenant } from '@/lib/db/tenant'

// =============================================================================
// FILE: src/lib/queries/order-risk.ts
//
// WHAT THE RISK RULES READ (src/domains/orders/risk.ts), for a page of orders
// in ONE query (spec § Scalability). Every subquery names its tenant; counts are
// against each order's own placed_at, so its risk does not change the next day.
// An erased order (no phone) has no history to read. The shop's median COD
// order is over the 90 days before now (one figure for the page: "usual" order).
// =============================================================================

export async function riskFactsFor(tenantId: string, orderIds: string[], now = new Date()): Promise<Map<string, RiskFacts>> {
  if (!orderIds.length) return new Map()
  const since = new Date(now.getTime() - 90 * 86_400_000).toISOString()
  return withTenant(tenantId, async (tx) => {
    const [m] = await tx.execute<{ median: string | null; n: number }>(sql`select percentile_cont(0.5) within group (order by total) as median, count(*)::int as n
      from orders where tenant_id = ${tenantId} and payment_method = 'cod' and cancelled_at is null and placed_at >= ${since}::timestamptz`)
    const medianCod = m && m.n >= MIN_FOR_MEDIAN && m.median !== null ? Number(m.median) : null
    const same = (a: string) => sql.raw(`(select array_agg(l.variant_id order by l.variant_id) from order_lines l where l.tenant_id = ${a}.tenant_id and l.order_id = ${a}.id)`)
    const rows = await tx.select({
      id: orders.id, total: orders.total, customerName: orders.customerName, addressLine: orders.addressLine, area: orders.area, city: orders.city, phone: orders.phone,
      paidAt: orders.paidAt, method: orders.paymentMethod, switchedAt: orders.switchedToCodAt, pincodeCity: pincodes.city,
      sameItems: sql<number>`(select count(*)::int from orders o2 where o2.tenant_id = ${tenantId} and o2.phone = "orders"."phone" and o2.id <> "orders"."id"
        and ${standingSql('o2')} and o2.placed_at between "orders"."placed_at" - interval '24 hours' and "orders"."placed_at" and ${same('o2')} = ${same('"orders"')})`,
      codToday: sql<number>`(select count(*)::int from orders o2 where o2.tenant_id = ${tenantId} and o2.phone = "orders"."phone" and o2.paid_at is null
        and (o2.payment_method = 'cod' or o2.switched_to_cod_at is not null) and o2.placed_at <= "orders"."placed_at"
        and (o2.placed_at at time zone 'Asia/Kolkata')::date = ("orders"."placed_at" at time zone 'Asia/Kolkata')::date)`,
      fake: sql<number>`(select count(*)::int from orders o2 where o2.tenant_id = ${tenantId} and o2.phone = "orders"."phone" and o2.cancel_reason = 'fake' and o2.placed_at < "orders"."placed_at")`,
      earlier: sql<number>`(select count(*)::int from orders o2 where o2.tenant_id = ${tenantId} and o2.phone = "orders"."phone" and ${placedSql('o2')} and o2.placed_at < "orders"."placed_at")`,
    }).from(orders).leftJoin(pincodes, eq(pincodes.pincode, orders.pincode)).where(and(eq(orders.tenantId, tenantId), inArray(orders.id, orderIds)))
    return new Map(rows.map((r) => {
      const known = r.phone !== ''
      return [r.id, {
        cod: !r.paidAt && (r.method === 'cod' || !!r.switchedAt), total: Number(r.total), customerName: r.customerName,
        // Before 1D the area was joined onto the line: the rule then reads the whole line (more lenient, never stricter).
        addressLine: r.addressLine, city: r.city, pincodeCity: r.pincodeCity ?? null,
        sameItemsWithin24h: known ? r.sameItems : 0, codFromPhoneToday: known ? r.codToday : 1, cancelledAsFake: known ? r.fake : 0, earlierOrders: known ? r.earlier : 1,
        medianCod,
      } satisfies RiskFacts]
    }))
  })
}
