import 'server-only'
import { desc, eq, sql } from 'drizzle-orm'
import { orderLines, orders } from '@/lib/db/schema-orders'
import { withTenant } from '@/lib/db/tenant'
import { shopSettings, tenants } from '@/lib/db/schema'
import { orderPrefix } from '@/domains/signup/slug'

/** The console's order list (newest 100). Filtered by tenant twice: the policy, and this where. */
export async function listOrders(tenantId: string, limit = 100) {
  return withTenant(tenantId, (tx) =>
    tx.select({
      id: orders.id, number: orders.number, paymentMethod: orders.paymentMethod, total: orders.total, customerName: orders.customerName, city: orders.city,
      placedAt: orders.placedAt, payBy: orders.payBy, paidAt: orders.paidAt, switchedToCodAt: orders.switchedToCodAt, confirmedAt: orders.confirmedAt, cancelledAt: orders.cancelledAt,
      shippedAt: orders.shippedAt, ndrAt: orders.ndrAt, deliveredAt: orders.deliveredAt, rtoInitiatedAt: orders.rtoInitiatedAt, rtoDeliveredAt: orders.rtoDeliveredAt,
      items: sql<number>`(select coalesce(sum(l.qty), 0)::int from ${orderLines} l where l.order_id = "orders"."id" and l.tenant_id = ${tenantId})`,
    }).from(orders).where(eq(orders.tenantId, tenantId)).orderBy(desc(orders.placedAt)).limit(limit),
  )
}

export type OrderRow = Awaited<ReturnType<typeof listOrders>>[number]

/** "KS": the letters an order number is shown with (KS-1001), from Settings or the shop's name. */
export async function orderPrefixFor(tenantId: string): Promise<string> {
  const [r] = await withTenant(tenantId, (tx) => tx.select({ prefix: shopSettings.orderPrefix, name: tenants.name }).from(tenants).innerJoin(shopSettings, eq(shopSettings.tenantId, tenants.id)).where(eq(tenants.id, tenantId)))
  return orderPrefix(r?.prefix ?? '', r?.name ?? '')
}
