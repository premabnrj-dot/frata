import 'server-only'
import { and, eq, or } from 'drizzle-orm'
import { inbound } from '@/domains/reviews/inbound'
import { phoneHmac } from '@/lib/crypto/secret-box'
import { orders } from '@/lib/db/schema-orders'
import { withTenant } from '@/lib/db/tenant'
import { reviewRequests, reviewSettings, waOptOuts } from './schema'

// =============================================================================
// FILE: src/lib/modules/reviews/inbound.ts — Reviews' part of a WhatsApp item, once it is stored (6b-2).
// Inside the item's own shop (the webhook routed it there by its account or number). Idempotent: Meta retries,
// so a second Stop or status changes nothing. A Stop is matched on the ask's wamid, then the ORDER's phone goes on
// the shop's opt-out list as a keyed hash — never the number, never from the item (it may carry none).
// =============================================================================

export async function reviewsOnWhatsApp(tenantId: string, field: string, value: unknown, now: Date): Promise<void> {
  const it = inbound(field, value)
  if (!it) return
  await withTenant(tenantId, async (tx) => {
    if (it.kind === 'stop' || it.kind === 'failed') {
      const [r] = await tx.select({ id: reviewRequests.id, orderId: reviewRequests.orderId }).from(reviewRequests)
        .where(and(eq(reviewRequests.tenantId, tenantId), or(eq(reviewRequests.wamid, it.wamid), eq(reviewRequests.reminderWamid, it.wamid)))).limit(1)
      if (!r) return
      if (it.kind === 'failed') {
        await tx.update(reviewRequests).set({ failedAt: now, failCode: `meta_${it.code ?? 'failed'}` }).where(and(eq(reviewRequests.tenantId, tenantId), eq(reviewRequests.id, r.id)))
        return
      }
      const [o] = await tx.select({ phone: orders.phone }).from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.id, r.orderId)))
      if (o?.phone) await tx.insert(waOptOuts).values({ tenantId, phoneHmac: phoneHmac(tenantId, o.phone), at: now }).onConflictDoNothing()
      return
    }
    // The template's status or category: only the shop's own review template (inbound() checked the name).
    const set = { ...(it.id ? { templateId: it.id } : {}), ...(it.status ? { templateStatus: it.status } : {}), ...(it.category ? { templateCategory: it.category } : {}), templateAt: now }
    await tx.insert(reviewSettings).values({ tenantId, ...set }).onConflictDoUpdate({ target: reviewSettings.tenantId, set })
  })
}
