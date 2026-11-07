import 'server-only'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { orders } from '@/lib/db/schema-orders'
import { withTenant } from '@/lib/db/tenant'

// =============================================================================
// FILE: src/lib/orders/erase.ts
//
// AN ONLINE ORDER NEVER PAID keeps its row and lines for counts, but not the
// shopper's details past 90 days (checkout spec, retention; DPDP). Run by the
// daily cron for each shop app_shops_to_erase() names, inside that shop's
// transaction. The one place this rule lives.
// =============================================================================

export const ERASE_AFTER_DAYS = 90

export async function eraseAbandoned(tenantId: string, now = new Date()): Promise<number> {
  const before = new Date(now.getTime() - ERASE_AFTER_DAYS * 86_400_000).toISOString()
  return withTenant(tenantId, async (tx) => {
    const r = await tx.update(orders).set({ customerName: '', phone: '', addressLine: '', area: '', landmark: '', erasedAt: now })
      .where(and(eq(orders.tenantId, tenantId), isNull(orders.erasedAt), isNull(orders.paidAt), isNull(orders.switchedToCodAt), eq(orders.paymentMethod, 'prepaid'),
        sql`${orders.placedAt} < ${before}::timestamptz`)).returning({ id: orders.id })
    return r.length
  })
}
