import 'server-only'
import { and, count, eq } from 'drizzle-orm'
import { products } from '@/lib/db/schema-catalogue'
import { withTenant } from '@/lib/db/tenant'
import { paymentStatus, type PaymentStatus } from '@/lib/payments/keys'

/** The console's view of the shop's Razorpay connection (status columns; the webhook secret only until the first event). */
export async function paymentStatusFor(tenantId: string): Promise<PaymentStatus> {
  return withTenant(tenantId, (tx) => paymentStatus(tx, tenantId))
}

/** Products shoppers can buy: the "Open your shop" step needs one. */
export async function activeProductCount(tenantId: string): Promise<number> {
  const [r] = await withTenant(tenantId, (tx) => tx.select({ n: count() }).from(products).where(and(eq(products.tenantId, tenantId), eq(products.status, 'active'))))
  return r?.n ?? 0
}
