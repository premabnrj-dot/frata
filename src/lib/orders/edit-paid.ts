import 'server-only'
import { and, desc, eq, isNotNull, isNull, sql, type SQL } from 'drizzle-orm'
import type { EditInput } from './edit'
import type { EditPlan } from '@/domains/orders/edit'
import { messageKey } from '@/domains/messaging/events'
import type { Tx } from '@/lib/db'
import { orderEditLines, orderEdits, orderRefunds } from '@/lib/db/schema-edits'
import { orderEvents, orders } from '@/lib/db/schema-orders'
import { withTenant } from '@/lib/db/tenant'
import { enqueue, GiveUp, type OutboxRow } from '@/lib/outbox'
import { keysFor, noteKeysAnswer } from '@/lib/payments/keys'
import { checkoutSignatureOk, createOrder, orderByReceipt } from '@/lib/payments/razorpay'
import { queueRefund, recordRefundedFee } from '@/lib/payments/refunds'
import { checkoutShop } from '@/lib/queries/checkout'
import { editWaitingSql } from '@/lib/db/order-predicates'
import { sellsAs, type EditRead } from './edit-facts'
import type { Pay } from './place'
import { current, moment, record, type Actor, type Done } from './work'

// =============================================================================
// FILE: src/lib/orders/edit-paid.ts
//
// A HIGHER TOTAL ON A PAID-ONLINE ORDER (order edit OE·2; owner 2026-11-12: the shopper pays the difference first).
// Save stores the edit as WAITING (order_edits.asked, its lines in order_edit_lines) and changes nothing on the order:
// lines, totals, stock and any booking stay; its new in-stock pieces are held (order_edit_lines.held, read by checkout's
// heldSql) so nobody else buys them meanwhile, and packing is refused while it waits. The shopper pays on our order
// page through Razorpay Checkout on the shop's own key, against a SECOND Razorpay order (receipt `${number}-e${id8}`,
// found again by receipt on a retry); the signature is checked with OUR stored second order id, and the capture is
// stored first as an event and applied under the order's lock and a slot like every capture (edit-capture.ts). The
// merchant's ways out: "Ship without the change" (dropRequest: the hold ends, the order packs as it was) or Cancel. A
// reminder Notice after 24 hours. Also here: a payment on the order's FIRST Razorpay order after its items changed
// (strayCapture) — refunded in full, never marking the edited order paid at the old total.
// =============================================================================


export type Waiting = { id: string; asked: number; eventId: string; createdAt: Date; razorpayOrderId: string | null; totalAfter: number }
/** This order's waiting request, if any. */
export async function waitingEdit(tx: Tx, tenantId: string, orderId: string): Promise<Waiting | null> {
  const [w] = await tx.select({ id: orderEdits.id, asked: orderEdits.asked, eventId: orderEdits.eventId, createdAt: orderEdits.createdAt, razorpayOrderId: orderEdits.razorpayOrderId, totalAfter: orderEdits.totalAfter })
    .from(orderEdits).innerJoin(orders, and(eq(orders.tenantId, orderEdits.tenantId), eq(orders.id, orderEdits.orderId)))
    .where(and(eq(orderEdits.tenantId, tenantId), eq(orderEdits.orderId, orderId), editWaitingSql('"order_edits"', '"orders"'))).limit(1)
  return w ? { ...w, asked: Number(w.asked), totalAfter: Number(w.totalAfter) } : null
}

/**
 * Razorpay's fee (or its GST) on every later payment this order carries: a change it paid for, and a payment refunded in
 * full (after_drop, old_order: its first attempt holds it). Added to the order's own once that is known (payment.ts).
 */
export const editFeesSql = (tenantId: string, orderId: string, part: 'fee' | 'tax'): SQL =>
  sql`((select coalesce(sum(${part === 'fee' ? orderEdits.gatewayFee : orderEdits.gatewayTax}), 0) from ${orderEdits} where ${orderEdits.tenantId} = ${tenantId} and ${orderEdits.orderId} = ${orderId})
    + (select coalesce(sum(${part === 'fee' ? orderRefunds.gatewayFee : orderRefunds.gatewayTax}), 0) from ${orderRefunds} where ${orderRefunds.tenantId} = ${tenantId} and ${orderRefunds.orderId} = ${orderId} and ${orderRefunds.retryOf} is null))`

/** A change's held pieces go back on sale (paid, dropped, refunded or cancelled): `held` to 0, so the partial index stays
 * small. The variants it held, for the caller's sold-out refresh. */
export async function releaseHeld(tx: Tx, tenantId: string, editId: string): Promise<string[]> {
  const rows = await tx.update(orderEditLines).set({ held: 0 }).where(and(eq(orderEditLines.tenantId, tenantId), eq(orderEditLines.editId, editId), sql`${orderEditLines.held} > 0`))
    .returning({ v: orderEditLines.variantId })
  return rows.flatMap((r) => (r.v ? [r.v] : []))
}

/**
 * Save a higher total on a paid order as a request: the record and its lines (the `after` lines that are new carry no
 * order line yet, and hold their in-stock pieces), one `edit_requested` event, the email at once (no Undo: nothing
 * changed), and the 24-hour reminder. `soldOut`: the variants it holds, for the caller to refresh on the shop.
 */
export async function requestPayment(sp: Tx, tenantId: string, actor: Actor, orderId: string, p: EditPlan, read: EditRead, asked: number, input: EditInput, now: Date) {
  const stamp = moment(now)
  const eventId = await record(sp, tenantId, orderId, actor, 'edit_requested', stamp)
  const [edit] = await sp.insert(orderEdits).values({ tenantId, orderId, eventId, totalBefore: p.total.before, totalAfter: p.total.after, shippingBefore: p.shipping.before,
    shippingAfter: p.shipping.after, notify: input.notify, asked }).returning({ id: orderEdits.id })
  const reasonOf = new Map(p.removed.map((x) => [x.line.id, x.reason]))
  // The pieces it holds: the new in-stock ones (a swap's or an added line's, or the extra pieces of a line).
  const held = (l: EditPlan['lines'][number]) => {
    if (l.change === 'kept' || !l.variantId) return 0
    const v = read.rows.find((x) => x.variantId === l.variantId)
    if (!v || sellsAs(v, read.live, l.qty, now).kind !== 'in_stock') return 0
    return l.change === 'qty' ? Math.max(0, l.qty - l.from!.qty) : l.qty
  }
  await sp.insert(orderEditLines).values([
    ...read.live.map((l) => ({ tenantId, editId: edit!.id, side: 'before', orderLineId: l.id, variantId: l.variantId, qty: l.qty, unitPrice: l.unitPrice, productDiscount: l.productDiscount, lineDiscount: l.lineDiscount, reason: reasonOf.get(l.id) ?? null })),
    ...p.lines.map((l, i) => ({ tenantId, editId: edit!.id, side: 'after', orderLineId: l.change === 'kept' ? l.from!.id : null, variantId: l.variantId, qty: l.qty, unitPrice: l.unitPrice,
      productDiscount: p.price.lines[i]!.productDiscount, lineDiscount: p.price.lines[i]!.discount, replaces: l.change === 'kept' || !l.from ? null : l.from.id, held: held(l) })),
  ])
  const [o] = await sp.select({ email: orders.email }).from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId)))
  if (input.notify && o?.email) await enqueue(sp, { tenantId, kind: 'email.order', dedupeKey: messageKey('email', 'edited', eventId), payload: { orderId, eventId, kind: 'edited' }, notBefore: now })
  await enqueue(sp, { tenantId, kind: 'edit.remind', dedupeKey: `edit.remind:${edit!.id}`, payload: { editId: edit!.id }, notBefore: new Date(now.getTime() + 24 * 3_600_000) })
  return { ok: true as const, eventId, total: p.total.before, soldOut: p.lines.filter((l) => held(l) > 0).map((l) => l.variantId!), backInStock: [] as string[], asked }
}

/** "Ship without the change": the request is dropped, its held pieces go back on sale, the order packs as it was. */
export async function dropRequest(tx: Tx, tenantId: string, actor: Actor, orderId: string, now = new Date()): Promise<Done<{ backInStock: string[] }>> {
  if (actor.kind === 'support') return { ok: false, error: 'A support visit can\'t change an order\'s items.' }
  const c = await current(tx, tenantId, orderId, now)
  if (!c) return { ok: false, error: 'Order not found.' }
  const w = await waitingEdit(tx, tenantId, orderId)
  if (!w) return { ok: false, error: 'Nothing is waiting for the shopper now.' }
  const stamp = moment(now)
  const r = await tx.update(orderEdits).set({ droppedAt: stamp, droppedReason: 'ship_without' })
    .where(and(eq(orderEdits.tenantId, tenantId), eq(orderEdits.id, w.id), isNull(orderEdits.paidAt), isNull(orderEdits.droppedAt))).returning({ id: orderEdits.id })
  if (!r.length) return { ok: false, error: 'This order changed. Reload the page.' }
  const backInStock = await releaseHeld(tx, tenantId, w.id)
  return { ok: true, eventId: await record(tx, tenantId, orderId, actor, 'edit_dropped', stamp), backInStock }
}

/**
 * A payment on this order's FIRST Razorpay order after its items changed (an order switched to pay on delivery and then
 * edited: the shopper paid the old online total). Never marks it paid: the whole payment is refunded at once (once per
 * payment) and the order stays as edited, paid on delivery. False: not such a payment (markPaid goes on as before).
 */
export async function strayCapture(tx: Tx, o: { id: string; tenantId: string }, pay: { paymentId: string; fee?: number | null; tax?: number | null }): Promise<boolean> {
  const paymentId = pay.paymentId
  const [ord] = await tx.select({ paidAt: orders.paidAt, online: sql<number | null>`(${orders.checkout}->>'onlineTotal')::bigint`.mapWith((v) => (v == null ? null : Number(v))) })
    .from(orders).where(and(eq(orders.tenantId, o.tenantId), eq(orders.id, o.id))).for('update')
  if (!ord || ord.paidAt || !ord.online) return false
  // An edit that took effect (applied at once, or paid) and was not undone.
  const [edited] = await tx.select({ id: orderEdits.id }).from(orderEdits)
    .where(and(eq(orderEdits.tenantId, o.tenantId), eq(orderEdits.orderId, o.id), sql`(${orderEdits.asked} is null or ${orderEdits.paidAt} is not null)`,
      sql`not exists (select 1 from ${orderEvents} u where u.tenant_id = ${orderEdits.tenantId} and u.undoes = ${orderEdits.eventId})`)).limit(1)
  if (!edited) return false
  const [had] = await tx.select({ id: orderRefunds.id }).from(orderRefunds).where(and(eq(orderRefunds.tenantId, o.tenantId), eq(orderRefunds.razorpayPaymentId, paymentId), eq(orderRefunds.cause, 'old_order'))).limit(1)
  if (!had) await queueRefund(tx, o.tenantId, { orderId: o.id, editId: null, cause: 'old_order', paymentId, amount: ord.online, notBefore: new Date() })
  // Razorpay keeps its fee on it: once, when known (the webhook after the browser's reply brings it).
  await recordRefundedFee(tx, o.tenantId, o.id, paymentId, pay.fee, pay.tax)
  return true
}

/** The order by its link's hash, with its waiting request (the shopper's page). */
async function byHash(tx: Tx, tenantId: string, hash: string) {
  if (!/^[0-9a-f]{64}$/.test(hash)) return null
  const [o] = await tx.select({ id: orders.id, number: orders.number, name: orders.customerName, phone: orders.phone }).from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.tokenHash, hash)))
  return o ? { o, w: await waitingEdit(tx, tenantId, o.id) } : null
}

/** "Pay ₹N for the changes": the second Razorpay order for the waiting request, made once (reused on a retry). */
export async function startEditPayment(tenantId: string, hash: string): Promise<{ ok: true; pay: Pay } | { ok: false; status: 404 | 422; error: string }> {
  const pre = await withTenant(tenantId, async (tx) => {
    const r = await byHash(tx, tenantId, hash)
    return r ? { ...r, keys: await keysFor(tx, tenantId), shop: (await checkoutShop(tx, tenantId, null))?.name ?? '' } : null
  })
  if (!pre?.w) return { ok: false, status: 404, error: 'Nothing to pay for this order now.' }
  const { o, w, keys } = pre
  if (!keys) return { ok: false, status: 422, error: 'Online payment is not working right now. Message the shop.' }
  let rzp = w.razorpayOrderId
  if (!rzp) {
    const receipt = `${o.number}-e${w.id.slice(0, 8)}`
    const made = await createOrder(keys, { amount: w.asked, receipt, notes: { frata_order: o.id, frata_edit: w.id } })
    await noteKeysAnswer(tenantId, keys, made)
    // A receipt is unique per account: a retry after a lost answer finds the order it made.
    const found = made.ok ? { ok: true as const, id: made.id, amount: w.asked } : await orderByReceipt(keys, receipt)
    if (!found.ok || !found.id || found.amount !== w.asked) {
      console.error('[startEditPayment] razorpay order', made.ok ? 'mismatch' : made.status)
      return { ok: false, status: 422, error: 'Online payment could not open. Try again.' }
    }
    rzp = await withTenant(tenantId, async (tx) => {
      await tx.update(orderEdits).set({ razorpayOrderId: found.id! }).where(and(eq(orderEdits.tenantId, tenantId), eq(orderEdits.id, w.id), isNull(orderEdits.razorpayOrderId)))
      // Razorpay is asked, too, in case the reply and the webhook are both lost (payment-check.ts sendEditPaymentCheck).
      await enqueue(tx, { tenantId, kind: 'edit.payment', dedupeKey: `edit.payment:${w.id}`, payload: { editId: w.id }, notBefore: new Date(Date.now() + 15 * 60_000) })
      const [r] = await tx.select({ rzp: orderEdits.razorpayOrderId }).from(orderEdits).where(and(eq(orderEdits.tenantId, tenantId), eq(orderEdits.id, w.id)))
      return r?.rzp ?? found.id!
    })
  }
  return { ok: true, pay: { keyId: keys.keyId, razorpayOrderId: rzp!, amount: w.asked, name: o.name, phone: o.phone, shop: pre.shop } }
}

/**
 * Checkout's reply for a change: genuine only when signed for OUR stored second order (the latest the order made,
 * waiting or dropped since: a late payment is still recorded, then refunded). Returns the event to store first.
 */
export async function editReplyEvent(tenantId: string, hash: string, reply: { paymentId: string; signature: string }): Promise<{ key: string; payload: object } | null> {
  const pre = await withTenant(tenantId, async (tx) => {
    if (!/^[0-9a-f]{64}$/.test(hash)) return null
    const [o] = await tx.select({ id: orders.id }).from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.tokenHash, hash)))
    if (!o) return null
    const [e] = await tx.select({ rzp: orderEdits.razorpayOrderId, asked: orderEdits.asked }).from(orderEdits)
      .where(and(eq(orderEdits.tenantId, tenantId), eq(orderEdits.orderId, o.id), isNotNull(orderEdits.razorpayOrderId))).orderBy(desc(orderEdits.createdAt)).limit(1)
    return e ? { e, keys: await keysFor(tx, tenantId) } : null
  })
  if (!pre?.keys || !checkoutSignatureOk(pre.e.rzp!, reply.paymentId, reply.signature, pre.keys.keySecret)) return null
  return { key: `razorpay:checkout.signed:${reply.paymentId}`, payload: { event: 'payment.captured',
    payload: { payment: { entity: { id: reply.paymentId, order_id: pre.e.rzp, amount: Number(pre.e.asked), currency: 'INR', status: 'captured' } } } } }
}

/** The `edit.remind` sender: still waiting after 24 hours → a Notice to the shop (the definer checks and writes it once). */
export async function sendEditReminder(row: OutboxRow): Promise<void> {
  const id = (row.payload as { editId?: unknown })?.editId
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) throw new GiveUp('bad payload')
  await withTenant(row.tenantId, (tx) => tx.execute(sql`select app_edit_payment_notice(${id}::uuid)`))
}
