import 'server-only'
import { and, eq } from 'drizzle-orm'
import { orders } from '@/lib/db/schema-orders'
import { withTenant } from '@/lib/db/tenant'
import type { Tx } from '@/lib/db'
import { enqueue, GiveUp, Later, type OutboxRow } from '@/lib/outbox'
import { keysFor } from '@/lib/payments/keys'
import { orderPayments } from '@/lib/payments/razorpay'
import { refreshSoldOut } from '@/lib/queries/storefront'
import { markPaid } from './payment'

// =============================================================================
// FILE: src/lib/orders/payment-check.ts — ASK RAZORPAY, DON'T WAIT TO BE TOLD (shop stress test 2026-11-11). An online
// order became paid only by the browser's reply or Razorpay's webhook. With the tab closed after paying and the webhook
// lost (or late), the order stayed unpaid for good, and a minute after its hold "Finish paying… nothing was charged"
// went to a shopper who had paid. Now, when the hold ends, an outbox row asks Razorpay for the order's payments (a GET,
// safe to repeat) and records a capture exactly as the webhook would (markPaid: once, paid_at is null). The Finish
// paying email asks the same question before it sends.
// =============================================================================

/** How long after the hold a payment still in flight is asked about again. */
const KEEP_ASKING_MS = 72 * 3_600_000

export type Settled = 'paid' | 'pending' | 'unpaid' | 'unknown'

/** Razorpay's word on one order: captured → recorded as paid; authorized → 'pending'; Razorpay unreachable → 'unknown'. */
export async function settleWithRazorpay(tenantId: string, orderId: string): Promise<Settled> {
  const pre = await withTenant(tenantId, async (tx) => {
    const [o] = await tx.select({ rzp: orders.razorpayOrderId, paidAt: orders.paidAt, cancelledAt: orders.cancelledAt, switchedAt: orders.switchedToCodAt, method: orders.paymentMethod })
      .from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId))).limit(1)
    return o ? { o, keys: await keysFor(tx, tenantId) } : null
  })
  if (!pre) return 'unpaid'
  const { o, keys } = pre
  if (o.paidAt) return 'paid'
  // A switch to COD asked Razorpay itself before switching; a cancelled order is the shop's to refund by hand.
  if (o.method !== 'prepaid' || !o.rzp || o.switchedAt || o.cancelledAt || !keys) return 'unpaid'
  const pays = await orderPayments(keys, o.rzp)
  if (pays === null) return 'unknown'
  const captured = pays.find((p) => p.status === 'captured')
  if (captured) {
    const soldOut: string[] = []
    await withTenant(tenantId, (tx) => markPaid(tx, { id: orderId, tenantId }, { paymentId: captured.id, fee: captured.fee, tax: captured.tax }, soldOut))
    if (soldOut.length) refreshSoldOut(tenantId)
    return 'paid'
  }
  return pays.some((p) => p.status === 'authorized' || p.status === 'created') ? 'pending' : 'unpaid'
}

/** Queued with the order (its own transaction): asks when the hold ends. */
export async function enqueuePaymentCheck(tx: Tx, tenantId: string, orderId: string, payBy: Date): Promise<void> {
  await enqueue(tx, { tenantId, kind: 'payment.check', dedupeKey: `payment.check:${orderId}`, payload: { orderId }, notBefore: payBy })
}

/** The `payment.check` sender. A payment in flight, or Razorpay not answering, asks again later, up to 72 hours. */
export async function sendPaymentCheck(row: OutboxRow): Promise<void> {
  const orderId = (row.payload as { orderId?: unknown })?.orderId
  if (typeof orderId !== 'string' || !/^[0-9a-f-]{36}$/.test(orderId)) throw new GiveUp('bad payload')
  const r = await settleWithRazorpay(row.tenantId, orderId)
  if (r === 'paid' || r === 'unpaid') return
  if (Date.now() - new Date(row.createdAt).getTime() > KEEP_ASKING_MS) throw new GiveUp(`still ${r} after 72 hours`)
  throw new Later(r === 'pending' ? 'payment in flight' : 'razorpay unreachable', r === 'pending' ? 10 : 5)
}
