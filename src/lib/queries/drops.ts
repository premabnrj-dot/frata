import 'server-only'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { withTenant } from '@/lib/db/tenant'
import { orders } from '@/lib/db/schema-orders'
import { customerConsents, shopCustomers } from '@/lib/db/schema-customers'
import { emailLinkTokenOk } from '@/lib/email/drops'
import { consentHashes } from '@/lib/email/hash'
import { cleanEmail } from '@/domains/email/shape'
import { cleanMobile } from '@/domains/checkout/mobile'

// =============================================================================
// FILE: src/lib/queries/drops.ts — "EMAIL ME NEW DROPS" (email plan E·2, task 14; owner 2026-11-11: marketing email
// goes only to shoppers who tapped this). The tenant is the host's; the order and its current address come from the
// token, which dies when the address changes. One standing consent per address: purpose marketing_email, sent by the
// shop, bound to that address's keyed hash (security review E·2 M1: the link proves the inbox, never the phone). The
// shopper row it hangs on is the order's, or the one for its phone (made if missing).
// =============================================================================

export const DROPS_NOTICE = 'email-drops@1'

export type DropsResult = 'saved' | 'already' | 'bad_link'

export async function consentToDrops(tenantId: string, orderId: string, token: string): Promise<DropsResult> {
  return withTenant(tenantId, async (tx) => {
    const [o] = await tx.select({ email: orders.email, customerId: orders.customerId, phone: orders.phone, name: orders.customerName })
      .from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId), isNull(orders.erasedAt))).limit(1)
    const email = cleanEmail(o?.email)
    if (!o || !email || !emailLinkTokenOk('drops', orderId, email, token)) return 'bad_link'
    let customerId = o.customerId
    if (!customerId) {
      if (!cleanMobile(o.phone)) return 'bad_link'
      const [c] = await tx.insert(shopCustomers).values({ tenantId, phone: o.phone, name: (o.name || 'Shopper').slice(0, 80), source: 'email' })
        .onConflictDoUpdate({ target: [shopCustomers.tenantId, shopCustomers.phone], set: { phone: o.phone } }).returning({ id: shopCustomers.id })
      customerId = c!.id
    }
    // One live consent per address per shop (a unique index): two taps at once save one.
    const h = consentHashes(tenantId, email)
    if (!h) return 'bad_link'
    const [live] = await tx.select({ id: customerConsents.id }).from(customerConsents).where(and(eq(customerConsents.tenantId, tenantId),
      eq(customerConsents.purpose, 'marketing_email'), inArray(customerConsents.addressHash, h.lookup), isNull(customerConsents.withdrawnAt))).limit(1)
    if (live) return 'already'
    const made = await tx.insert(customerConsents).values({ tenantId, customerId, purpose: 'marketing_email', channel: 'email', sender: 'shop', noticeVersion: DROPS_NOTICE, addressHash: h.write })
      .onConflictDoNothing().returning({ id: customerConsents.id })
    if (!made.length) return 'already'
    return 'saved'
  })
}
