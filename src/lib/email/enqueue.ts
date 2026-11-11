import 'server-only'
import { and, eq } from 'drizzle-orm'
import type { withTenant } from '@/lib/db/tenant'
import { orders } from '@/lib/db/schema-orders'
import { enqueue } from '@/lib/outbox'
import { messageKey, sendAfter, type OrderMessage } from '@/domains/messaging/events'

// =============================================================================
// FILE: src/lib/email/enqueue.ts — AN ORDER EVENT QUEUES ITS EMAIL, IN THE WRITER'S OWN TRANSACTION (email plan
// decision 6; ADR-0006). Only when the order has an email. Keyed by the event (shipped and delivered can be undone and
// done again: a new event, a new email) or, for once-per-order emails, by the order. Payload: ids and the kind only.
// =============================================================================

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0]

export async function enqueueOrderEmail(tx: Tx, tenantId: string, orderId: string, kind: OrderMessage, eventId: string | null, now: Date): Promise<void> {
  const [o] = await tx.select({ email: orders.email, payBy: orders.payBy }).from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId))).limit(1)
  if (!o?.email) return
  await enqueue(tx, {
    tenantId, kind: 'email.order', dedupeKey: messageKey('email', kind, eventId ?? orderId),
    payload: { orderId, eventId, kind }, notBefore: sendAfter(kind, now, o.payBy),
  })
}
