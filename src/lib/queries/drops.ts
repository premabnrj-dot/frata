import 'server-only'
import { and, eq, isNull } from 'drizzle-orm'
import { withTenant } from '@/lib/db/tenant'
import { orders } from '@/lib/db/schema-orders'
import { customerConsents, shopCustomers } from '@/lib/db/schema-customers'
import { dropsTokenOk } from '@/lib/email/drops'
import { cleanEmail } from '@/domains/email/shape'

// =============================================================================
// FILE: src/lib/queries/drops.ts — "EMAIL ME NEW DROPS" (email plan E·2, task 14; owner 2026-11-11: marketing email
// goes only to shoppers who tapped this). The tenant is the host's; the order and its current address come from the
// token, which dies when the address changes. One standing consent per shopper: purpose marketing_email, sent by the
// shop. The shopper row is the order's, or the one for its phone (made if missing).
// =============================================================================

export const DROPS_NOTICE = 'email-drops@1'

export type DropsResult = 'saved' | 'already' | 'bad_link'

export async function consentToDrops(tenantId: string, orderId: string, token: string): Promise<DropsResult> {
  return withTenant(tenantId, async (tx) => {
    const [o] = await tx.select({ email: orders.email, customerId: orders.customerId, phone: orders.phone, name: orders.customerName })
      .from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId), isNull(orders.erasedAt))).limit(1)
    const email = cleanEmail(o?.email)
    if (!o || !email || !dropsTokenOk(orderId, email, token)) return 'bad_link'
    let customerId = o.customerId
    if (!customerId) {
      if (!/^[6-9][0-9]{9}$/.test(o.phone)) return 'bad_link'
      const [c] = await tx.insert(shopCustomers).values({ tenantId, phone: o.phone, name: (o.name || 'Shopper').slice(0, 80), source: 'email' })
        .onConflictDoUpdate({ target: [shopCustomers.tenantId, shopCustomers.phone], set: { phone: o.phone } }).returning({ id: shopCustomers.id })
      customerId = c!.id
    }
    const [live] = await tx.select({ id: customerConsents.id }).from(customerConsents).where(and(eq(customerConsents.tenantId, tenantId),
      eq(customerConsents.customerId, customerId), eq(customerConsents.purpose, 'marketing_email'), isNull(customerConsents.withdrawnAt))).limit(1)
    if (live) return 'already'
    await tx.insert(customerConsents).values({ tenantId, customerId, purpose: 'marketing_email', channel: 'email', sender: 'shop', noticeVersion: DROPS_NOTICE })
    return 'saved'
  })
}
