import 'server-only'
import { and, eq, sql } from 'drizzle-orm'
import { stateSql } from '@/lib/db/order-predicates'
import { orderLines, orders } from '@/lib/db/schema-orders'
import { withTenant } from '@/lib/db/tenant'

// The shop's best sellers (themes T1), read for the cached loader in storefront.ts (shopBestSellers) and the preview.

/** Best sellers: product ids by delivered units in the window, most first. Ids only: a count never leaves the server (ADR-0003). */
export async function coreBestSellers(tenantId: string, days: number): Promise<string[]> {
  const now = new Date()
  const since = new Date(now.getTime() - days * 86_400_000)
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.select({ productId: orderLines.productId }).from(orderLines)
      .innerJoin(orders, and(eq(orders.tenantId, orderLines.tenantId), eq(orders.id, orderLines.orderId)))
      .where(and(eq(orders.tenantId, tenantId), sql`${orders.deliveredAt} >= ${since.toISOString()}`, sql`${stateSql(now)} = 'delivered'`, sql`${orderLines.productId} is not null`))
      .groupBy(orderLines.productId).orderBy(sql`sum(${orderLines.qty}) desc`, orderLines.productId).limit(60)
    return rows.map((r) => r.productId!).filter(Boolean)
  })
}
