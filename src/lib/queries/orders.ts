import 'server-only'
import { desc, eq } from 'drizzle-orm'
import { orders } from '@/lib/db/schema-orders'
import { withTenant } from '@/lib/db/tenant'

/** The console's order list. Filtered by tenant twice: the policy, and this where. */
export async function listOrders(tenantId: string, limit = 50) {
  return withTenant(tenantId, (tx) =>
    tx.select().from(orders).where(eq(orders.tenantId, tenantId)).orderBy(desc(orders.placedAt)).limit(limit),
  )
}

export type OrderRow = Awaited<ReturnType<typeof listOrders>>[number]
