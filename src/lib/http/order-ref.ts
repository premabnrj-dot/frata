import 'server-only'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { withTenant } from '@/lib/db/tenant'
import { orders } from '@/lib/db/schema-orders'
import { orderToken, tokenHash } from '@/lib/crypto/secret-box'
import { emailLinkTokenOk, LINK_TOKEN } from '@/lib/email/drops'
import { cleanEmail } from '@/domains/email/shape'
import { Token } from './shop-api'

// How the shopper's order page names its order: the order's own token (the thank-you page and WhatsApp), or an
// email's link (order id + a token bound to the order's current address; E·2 security review M3). Either way the
// answer is the order's token hash, so the routes below it read the order one way.
export const OrderRef = z.union([z.object({ token: Token }), z.object({ o: z.uuid(), e: z.string().regex(LINK_TOKEN) })])
export type OrderRef = z.infer<typeof OrderRef>

export async function orderRefHash(tenantId: string, ref: OrderRef): Promise<string | null> {
  if ('token' in ref) return tokenHash(ref.token)
  const [o] = await withTenant(tenantId, (tx) => tx.select({ email: orders.email }).from(orders)
    .where(and(eq(orders.tenantId, tenantId), eq(orders.id, ref.o), isNull(orders.erasedAt))).limit(1))
  const email = cleanEmail(o?.email)
  return email && emailLinkTokenOk('order', ref.o, email, ref.e) ? tokenHash(orderToken(ref.o)) : null
}
