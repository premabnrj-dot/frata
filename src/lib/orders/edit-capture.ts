import 'server-only'
import { and, eq, isNull } from 'drizzle-orm'
import { capturedAsAsked } from '@/domains/orders/captured'
import { usesOn, type EditFacts, type EditReason, type Want } from '@/domains/orders/edit'
import { classOf } from '@/domains/checkout/discounts'
import type { Tx } from '@/lib/db'
import { orderEditLines, orderEdits, orderRefunds } from '@/lib/db/schema-edits'
import type { RzpPayment } from '@/lib/payments/razorpay'
import { addOrderFee, queueRefund, recordRefundedFee, supersedeFailed } from '@/lib/payments/refunds'
import { applyPlan, planLocked, Refused, stillFit } from './edit-write'
import { releaseHeld } from './edit-paid'
import { current, moment } from './work'

// =============================================================================
// FILE: src/lib/orders/edit-capture.ts
//
// A CAPTURE ON A CHANGE'S SECOND RAZORPAY ORDER (order edit OE·2), applied by processEvents like every capture: stored
// first as an event, then applied here under the order's lock and the shop's slot (payment.ts applyEvent, when no
// order has that Razorpay order id). Matched by OUR stored second order id and exactly the amount we asked, in INR.
// - Waiting: the edit takes effect now — planned again from the lines it was saved with, at the prices it was saved at
//   and with its own held pieces back, refused unless it comes to the total the shopper paid for; the held pieces
//   become the order's; its record is filled in (paid_at, the payment, the fee, the offers).
// - Dropped, cancelled, packed, or it can no longer apply (a price or the shop's delivery rules moved, a piece gone):
//   the payment is refunded at once in full (refund ledger, cause after_drop), and the order stays as it was.
// - Paid already by this payment (the webhook after the browser's reply): only its fee may be news; by another payment:
//   that one is refunded in full.
// A payment refunded in full leaves Razorpay's fee on it with the order (gateway_fee). Held pieces back on sale are
// listed in `soldOut` for the caller's refresh; a failed edit refund the change settled is never tried again.
// =============================================================================

export async function applyEditCapture(tx: Tx, tenantId: string, rzpOrderId: string, p: RzpPayment, currency: unknown, soldOut: string[]): Promise<string | null> {
  const [e] = await tx.select().from(orderEdits).where(and(eq(orderEdits.tenantId, tenantId), eq(orderEdits.razorpayOrderId, rzpOrderId)))
  if (!e || e.asked === null) return 'no such order'
  if (p.status !== 'captured' || !capturedAsAsked(p, { onlineTotal: Number(e.asked) }, currency)) return `amount or state does not match (${p.status})`
  const now = new Date()
  const c = await current(tx, tenantId, e.orderId, now)
  if (!c) return 'no such order'
  // The payment goes back in full, once, and Razorpay's fee on it stays with the order (unit-economics review 2026-11-12).
  const refund = async () => {
    const [had] = await tx.select({ id: orderRefunds.id }).from(orderRefunds).where(and(eq(orderRefunds.tenantId, tenantId), eq(orderRefunds.razorpayPaymentId, p.id))).limit(1)
    if (!had) await queueRefund(tx, tenantId, { orderId: e.orderId, editId: e.id, cause: 'after_drop', paymentId: p.id, amount: Number(e.asked), notBefore: now })
    await recordRefundedFee(tx, tenantId, e.orderId, p.id, p.fee, p.tax)
    return null
  }
  if (e.paidAt) {
    if (e.razorpayPaymentId === p.id) { if (p.fee != null) await feeNews(tx, tenantId, e.orderId, e.id, p.fee, p.tax); return null }
    // Another payment on a change already paid (security review 2026-11-12 L2): not the order's, refunded.
    return refund()
  }
  if (e.droppedAt || c.o.cancelledAt || c.o.packedAt) {
    if (!e.razorpayPaymentId) await tx.update(orderEdits).set({ razorpayPaymentId: p.id }).where(and(eq(orderEdits.tenantId, tenantId), eq(orderEdits.id, e.id), isNull(orderEdits.razorpayPaymentId)))
    soldOut.push(...await releaseHeld(tx, tenantId, e.id))
    return refund()
  }
  try {
    await tx.transaction((sp) => applyWaiting(sp, tenantId, e, p, now, soldOut))
    return null
  } catch (err) {
    if (!(err instanceof Refused)) throw err
    // It can no longer be what the shopper paid for: dropped, its pieces back on sale, and the payment goes back.
    await tx.update(orderEdits).set({ droppedAt: moment(now), droppedReason: 'cannot_apply', razorpayPaymentId: e.razorpayPaymentId ?? p.id })
      .where(and(eq(orderEdits.tenantId, tenantId), eq(orderEdits.id, e.id), isNull(orderEdits.droppedAt), isNull(orderEdits.paidAt)))
    soldOut.push(...await releaseHeld(tx, tenantId, e.id))
    return refund()
  }
}

async function applyWaiting(sp: Tx, tenantId: string, e: typeof orderEdits.$inferSelect, p: RzpPayment, now: Date, soldOut: string[]) {
  const rows = await sp.select().from(orderEditLines).where(and(eq(orderEditLines.tenantId, tenantId), eq(orderEditLines.editId, e.id)))
  const before = rows.filter((r) => r.side === 'before'), after = rows.filter((r) => r.side === 'after')
  const want: Want[] = after.map((r) => ({ line: r.orderLineId ?? r.replaces ?? null, variantId: r.variantId, qty: r.qty }))
  const reasons = Object.fromEntries(before.filter((b) => b.reason).map((b) => [b.orderLineId!, b.reason as EditReason]))
  // As it was saved: each new piece at the price it was shown at, and the pieces it held counted as the order's own.
  const price = new Map(after.filter((r) => !r.orderLineId && r.variantId).map((r) => [r.variantId!, Number(r.unitPrice)]))
  const held = new Map(after.filter((r) => r.held > 0 && r.variantId).map((r) => [r.variantId!, r.held]))
  const adjust = (f: EditFacts): EditFacts => ({ ...f, choices: f.choices.map((x) => (price.has(x.variantId) ? { ...x, price: price.get(x.variantId)! } : x)),
    room: Object.fromEntries(Object.entries(f.room).map(([v, n]) => [v, n + (held.get(v) ?? 0)])) })
  const { read, p: plan } = await planLocked(sp, tenantId, e.orderId, want, reasons, now, adjust)
  if (plan.total.after !== Number(e.totalAfter)) throw new Refused('moved')
  // Hours can pass between Save and the payment: a saving that grew must still fit its offer's limits now, as at Save
  // (impact review 2026-11-12).
  const way = read.facts.order.way
  const grew = plan.offers.flatMap((x) => { const o = read.facts.offers!.find((k) => k.rowId === x.rowId)!.kept
    return x.after > x.before && usesOn(way)({ class: classOf(o.terms.style), method: o.method }) ? [{ discountId: o.terms.id, amount: x.after, title: x.title }] : [] })
  if (await stillFit(sp, tenantId, e.orderId, grew, now)) throw new Refused('offer')
  // Stock is taken for the held pieces now (from the shelf); paid_at, written with the rest below, ends their hold.
  const w = await applyPlan(sp, tenantId, e.orderId, plan, read, now)
  soldOut.push(...w.soldOut, ...w.backInStock)
  for (const n of w.newLines) {
    if (!n.variantId) continue
    await sp.update(orderEditLines).set({ orderLineId: n.id }).where(and(eq(orderEditLines.tenantId, tenantId), eq(orderEditLines.editId, e.id), eq(orderEditLines.side, 'after'),
      isNull(orderEditLines.orderLineId), eq(orderEditLines.variantId, n.variantId)))
  }
  const done = await sp.update(orderEdits).set({ paidAt: moment(now), razorpayPaymentId: p.id, offersRemoved: w.moved, offersAdded: w.added })
    .where(and(eq(orderEdits.tenantId, tenantId), eq(orderEdits.id, e.id), isNull(orderEdits.paidAt), isNull(orderEdits.droppedAt))).returning({ id: orderEdits.id })
  if (!done.length) throw new Refused('moved')
  await releaseHeld(sp, tenantId, e.id)
  // Its total was worked out with any failed edit refund's money as the shop's: those are settled by it (H1).
  await supersedeFailed(sp, tenantId, e.orderId, e.id)
  if (p.fee != null) await feeNews(sp, tenantId, e.orderId, e.id, p.fee, p.tax)
}

/** Razorpay's fee on a change's payment: on its record once, and added to the order's own (profit per order) then. */
async function feeNews(tx: Tx, tenantId: string, orderId: string, editId: string, fee: number, tax: number | null) {
  const r = await tx.update(orderEdits).set({ gatewayFee: fee, gatewayTax: tax }).where(and(eq(orderEdits.tenantId, tenantId), eq(orderEdits.id, editId), isNull(orderEdits.gatewayFee))).returning({ id: orderEdits.id })
  if (r.length) await addOrderFee(tx, tenantId, orderId, fee, tax)
}
