import 'server-only'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { orders } from '@/lib/db/schema-orders'
import { withTenant } from '@/lib/db/tenant'
import { ERASED_KEYS } from '@/domains/analytics/attribution'

/** `checkout` with its attribution's click ids and referring site removed (null and {} stay as they are). */
const stripTracking = (col: typeof orders.checkout) =>
  sql`case when jsonb_typeof(${col}->'attribution') = 'object' then jsonb_set(${col}, '{attribution}', (${col}->'attribution') - ${sql.raw(`array[${ERASED_KEYS.map((k) => `'${k}'`).join(',')}]`)}::text[]) else ${col} end`

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
    // The click ids and the referring site go with the shopper's details (ERASED_KEYS: the one list); utm tags, the
    // merchant's own link names, stay for counts.
    const r = await tx.update(orders).set({ customerId: null, customerName: '', phone: '', email: null, addressLine: '', area: '', landmark: '', buyerGstin: null, buyerName: '', erasedAt: now, checkout: stripTracking(orders.checkout) })
      .where(and(eq(orders.tenantId, tenantId), isNull(orders.erasedAt), isNull(orders.paidAt), isNull(orders.switchedToCodAt), eq(orders.paymentMethod, 'prepaid'),
        sql`${orders.placedAt} < ${before}::timestamptz`)).returning({ id: orders.id })
    return r.length
  })
}
