import 'server-only'
import { and, eq } from 'drizzle-orm'
import { orders } from '@/lib/db/schema-orders'
import { withTenant } from '@/lib/db/tenant'
import type { Tx } from '@/lib/db'
import { enqueue, GiveUp, Later, type OutboxRow } from '@/lib/outbox'
import { keysFor, noteKeysAnswer } from '@/lib/payments/keys'
import { orderPayments } from '@/lib/payments/razorpay'
import { capturedAsAsked } from '@/domains/orders/captured'
import { markPaid, processEvents, storeRazorpayEvent, withSlot } from './payment'
import { orderEdits } from '@/lib/db/schema-edits'
import { waitingEdit } from './edit-paid'
import { refreshSoldOut } from '@/lib/queries/storefront'

// =============================================================================
// FILE: src/lib/orders/payment-check.ts — ASK RAZORPAY, DON'T WAIT TO BE TOLD (shop stress test 2026-11-11). An online
// order became paid only by the browser's reply or Razorpay's webhook. With the tab closed after paying and the webhook
// lost (or late), the order stayed unpaid for good, and a minute after its hold "Finish paying… nothing was charged"
// went to a shopper who had paid. Now, when the hold ends, an outbox row asks Razorpay for the order's payments (a GET,
// safe to repeat) and records a capture exactly as the webhook would (stored as its event, then applied: markPaid, once). The Finish
// paying email asks the same question before it sends.
// =============================================================================

/** How long after the hold a payment still in flight is asked about again. */
export const KEEP_ASKING_MS = 72 * 3_600_000

export type Settled = 'paid' | 'pending' | 'unpaid' | 'unknown'

/** Razorpay's word on one order: captured → recorded as paid; authorized → 'pending'; Razorpay unreachable → 'unknown'. */
export async function settleWithRazorpay(tenantId: string, orderId: string): Promise<Settled> {
  const pre = await withTenant(tenantId, async (tx) => {
    const [o] = await tx.select({ rzp: orders.razorpayOrderId, checkout: orders.checkout, paidAt: orders.paidAt, cancelledAt: orders.cancelledAt, switchedAt: orders.switchedToCodAt, method: orders.paymentMethod })
      .from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId))).limit(1)
    return o ? { o, keys: await keysFor(tx, tenantId) } : null
  })
  if (!pre) return 'unpaid'
  const { o, keys } = pre
  if (o.paidAt) return 'paid'
  // As the webhook would (applyEvent → markPaid): a capture after a switch to COD is still the shopper's money and is
  // recorded (markPaid reprices the order back to prepaid before packing, so the courier collects nothing), and one on a
  // cancelled order shows as a refund due (impact review 2026-11-11: the check skipped both).
  if (o.method !== 'prepaid' || !o.rzp || !keys) return 'unpaid'
  const asked = await orderPayments(keys, o.rzp)
  await noteKeysAnswer(tenantId, keys, asked)
  if (!asked.ok) return 'unknown'
  const pays = asked.items
  const captured = pays.find((p) => p.status === 'captured' && capturedAsAsked(p, o.checkout, p.currency))
  if (captured) {
    // As every capture now (a flash drop, 2026-11-11): stored first under the key Razorpay's own webhook uses (the two
    // are one event), then applied when the shop has room — here, or by the next pass (the 5-minute drain).
    await storeRazorpayEvent(tenantId, `razorpay:payment.captured:${captured.id}`, { event: 'payment.captured',
      payload: { payment: { entity: { id: captured.id, order_id: o.rzp, amount: captured.amount, currency: 'INR', status: 'captured', fee: captured.fee, tax: captured.tax } } } })
    // Busy: the stored event is the record; the next pass applies it. Applied here, that event later finds it paid.
    const soldOut: string[] = []
    const paid = await withSlot(tenantId, (tx) => markPaid(tx, { id: orderId, tenantId }, { paymentId: captured.id, fee: captured.fee, tax: captured.tax }, soldOut))
    if (paid !== null && soldOut.length) await refreshSoldOut(tenantId).catch(() => {})
    return 'paid'
  }
  return pays.some((p) => p.status === 'authorized' || p.status === 'created') ? 'pending' : 'unpaid'
}

/** Queued with the order, and again with each renewed hold (a retry), in that write's own transaction: asks when the
 * hold ends. One row per hold (its end in the key), so a retry's payment is asked about too (impact review). */
export async function enqueuePaymentCheck(tx: Tx, tenantId: string, orderId: string, payBy: Date): Promise<void> {
  await enqueue(tx, { tenantId, kind: 'payment.check', dedupeKey: `payment.check:${orderId}:${payBy.getTime()}`, payload: { orderId }, notBefore: payBy })
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

/**
 * The `edit.payment` sender (beside `payment.check`): asks Razorpay for the change's second order's payments, so a capture
 * whose browser reply and webhook were both lost is still recorded (stored as its event, then applied by processEvents).
 * Asks every 15 minutes while the change waits, for 72 hours.
 */
export async function sendEditPaymentCheck(row: OutboxRow): Promise<void> {
  const id = (row.payload as { editId?: unknown })?.editId
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) throw new GiveUp('bad payload')
  const pre = await withTenant(row.tenantId, async (tx) => {
    const [e] = await tx.select({ rzp: orderEdits.razorpayOrderId, asked: orderEdits.asked, orderId: orderEdits.orderId }).from(orderEdits).where(and(eq(orderEdits.tenantId, row.tenantId), eq(orderEdits.id, id)))
    return e?.rzp ? { e, waiting: !!(await waitingEdit(tx, row.tenantId, e.orderId)), keys: await keysFor(tx, row.tenantId) } : null
  })
  if (!pre?.keys) return
  const asked = await orderPayments(pre.keys, pre.e.rzp!)
  if (asked.ok) {
    const p = asked.items.find((x) => x.status === 'captured' && x.amount === Number(pre.e.asked) && x.currency === 'INR')
    if (p) {
      await storeRazorpayEvent(row.tenantId, `razorpay:payment.captured:${p.id}`, { event: 'payment.captured',
        payload: { payment: { entity: { id: p.id, order_id: pre.e.rzp, amount: p.amount, currency: 'INR', status: 'captured', fee: p.fee, tax: p.tax } } } })
      await processEvents(row.tenantId)
      return
    }
  }
  if (!pre.waiting) return
  if (Date.now() - new Date(row.createdAt).getTime() > 72 * 3_600_000) throw new GiveUp('no payment after 72 hours')
  throw new Later(asked.ok ? 'no payment yet' : 'razorpay unreachable', 15)
}
