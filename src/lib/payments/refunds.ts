import 'server-only'
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { AUTO_RETRIES, chainLength, refundable, tooOldToRefund, type Paid, type RefundRow } from '@/domains/orders/refunds'
import type { Tx } from '@/lib/db'
import { outbox } from '@/lib/db/schema'
import { orderEdits, orderRefunds, REFUND_CAUSES } from '@/lib/db/schema-edits'
import { orders } from '@/lib/db/schema-orders'
import { withTenant } from '@/lib/db/tenant'
import { enqueue, GiveUp, Later, type OutboxRow } from '@/lib/outbox'
import { keysFor, noteKeysAnswer } from './keys'
import { createRefund, fetchPayment, fetchRefund, paymentRefunds, type RzpRefund } from './razorpay'

// =============================================================================
// FILE: src/lib/payments/refunds.ts
//
// REFUNDS THROUGH THE SHOP'S OWN RAZORPAY (order edit OE·2; frata-integrations § Razorpay, refunds rechecked 2026-11-12).
// A refund is a row before it is a request (ADR-0006): `queueRefund` writes the attempt (order_refunds) and its
// `refund.send` outbox row in the caller's transaction; an edit's waits out its Undo window (`notBefore`). The sender
// claims the attempt (sending_at, committed BEFORE Razorpay is called: an Undo can no longer cancel it), lists the
// payment's refunds first (a matching receipt that is pending or processed is this attempt, done), checks the payment's
// age and what is left of it, then creates it: speed "normal" always, receipt and X-Refund-Idempotency = the attempt id,
// notes {order, edit}. Razorpay busy (409, "another operation in progress") waits a minute; unreachable is retried (the
// list finds one that went through); a refusal the merchant must act on (balance, 6 months, refunds off, keys) fails
// the attempt with our code and the order shows "Refund ₹X not sent" with Try again — the edit stands. `refund.check`
// reads a pending refund's state back (refund.* webhooks are optional and not relied on). A failed refund is tried again
// as a NEW attempt (a new receipt and key), by itself up to AUTO_RETRIES times, then by Try again.
// =============================================================================

export type Ledger = { payments: Paid[]; refunds: RefundRow[] }

/** The payments that paid this order (its own, and each change it paid for since) and every refund attempt on it. */
export async function ledgerIn(tx: Tx, tenantId: string, orderId: string): Promise<Ledger | null> {
  const [[o], edits, rows] = await Promise.all([
    tx.select({ paidAt: orders.paidAt, paymentId: orders.razorpayPaymentId, online: sql<number | null>`(${orders.checkout}->>'onlineTotal')::bigint`.mapWith((v) => (v == null ? null : Number(v))) })
      .from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId))),
    tx.select({ id: orderEdits.razorpayPaymentId, amount: orderEdits.asked, at: orderEdits.paidAt }).from(orderEdits)
      .where(and(eq(orderEdits.tenantId, tenantId), eq(orderEdits.orderId, orderId), isNotNull(orderEdits.paidAt))),
    tx.select().from(orderRefunds).where(and(eq(orderRefunds.tenantId, tenantId), eq(orderRefunds.orderId, orderId))).orderBy(asc(orderRefunds.createdAt)),
  ])
  if (!o?.paidAt || !o.paymentId || o.online === null) return null
  return {
    payments: [{ id: o.paymentId, amount: o.online, at: o.paidAt }, ...edits.map((e) => ({ id: e.id!, amount: Number(e.amount), at: e.at! }))],
    refunds: rows.map((r) => ({ ...r, amount: Number(r.amount) })),
  }
}

type Queue = { orderId: string; editId: string | null; cause: (typeof REFUND_CAUSES)[number]; paymentId: string; amount: number; notBefore: Date; retryOf?: string }

/** One refund attempt and its outbox row, in the caller's transaction. */
export async function queueRefund(tx: Tx, tenantId: string, q: Queue): Promise<string> {
  const [r] = await tx.insert(orderRefunds).values({ tenantId, orderId: q.orderId, editId: q.editId, cause: q.cause, razorpayPaymentId: q.paymentId, amount: q.amount, notBefore: q.notBefore, retryOf: q.retryOf ?? null })
    .returning({ id: orderRefunds.id })
  await enqueue(tx, { tenantId, kind: 'refund.send', dedupeKey: `refund.send:${r!.id}`, payload: { refundId: r!.id }, notBefore: q.notBefore })
  return r!.id
}

/**
 * An Undo takes back its edit's refunds, in the Undo's own transaction: only while none was claimed by the sender (false:
 * one is with Razorpay or on its way there, and the edit has no Undo). The outbox rows die with them.
 */
export async function cancelEditRefunds(tx: Tx, tenantId: string, editId: string, now: Date): Promise<boolean> {
  const rows = await tx.select({ id: orderRefunds.id, sendingAt: orderRefunds.sendingAt, cancelledAt: orderRefunds.cancelledAt }).from(orderRefunds)
    .where(and(eq(orderRefunds.tenantId, tenantId), eq(orderRefunds.editId, editId), eq(orderRefunds.cause, 'edit'))).for('update')
  if (rows.some((r) => r.sendingAt)) return false
  const open = rows.filter((r) => !r.cancelledAt).map((r) => r.id)
  if (!open.length) return true
  await tx.update(orderRefunds).set({ cancelledAt: now }).where(and(eq(orderRefunds.tenantId, tenantId), inArray(orderRefunds.id, open), isNull(orderRefunds.sendingAt), isNull(orderRefunds.failedAt)))
  await tx.update(outbox).set({ deadAt: now, lastError: 'cancelled by Undo' })
    .where(and(eq(outbox.tenantId, tenantId), inArray(outbox.dedupeKey, open.map((id) => `refund.send:${id}`)), isNull(outbox.sentAt), isNull(outbox.deadAt)))
  return true
}

const fail = (tenantId: string, id: string, failure: string) => withTenant(tenantId, async (tx) => {
  await tx.update(orderRefunds).set({ failedAt: new Date(), failure }).where(and(eq(orderRefunds.tenantId, tenantId), eq(orderRefunds.id, id), isNull(orderRefunds.failedAt), isNull(orderRefunds.processedAt)))
  if (failure !== 'failed') return
  // Razorpay failed it after accepting it: tried again by itself, as a new attempt, a few times (then Try again).
  const [r] = await tx.select().from(orderRefunds).where(and(eq(orderRefunds.tenantId, tenantId), eq(orderRefunds.id, id)))
  const chain = await tx.select({ id: orderRefunds.id, retryOf: orderRefunds.retryOf }).from(orderRefunds).where(and(eq(orderRefunds.tenantId, tenantId), eq(orderRefunds.orderId, r!.orderId)))
  if (chainLength(chain, r!) > AUTO_RETRIES) return
  await queueRefund(tx, tenantId, { orderId: r!.orderId, editId: r!.editId, cause: r!.cause as Queue['cause'], paymentId: r!.razorpayPaymentId, amount: Number(r!.amount), notBefore: new Date(), retryOf: r!.id })
})

/** Razorpay took it: its id and state, and a check queued while it is pending. */
async function taken(tenantId: string, id: string, rf: RzpRefund) {
  if (rf.status === 'failed') {
    await withTenant(tenantId, (tx) => tx.update(orderRefunds).set({ razorpayRefundId: rf.id, sentAt: new Date() }).where(and(eq(orderRefunds.tenantId, tenantId), eq(orderRefunds.id, id), isNull(orderRefunds.sentAt))))
    return fail(tenantId, id, 'failed')
  }
  await withTenant(tenantId, async (tx) => {
    const now = new Date()
    await tx.update(orderRefunds).set({ razorpayRefundId: rf.id, sentAt: now, ...(rf.status === 'processed' ? { processedAt: now } : {}) })
      .where(and(eq(orderRefunds.tenantId, tenantId), eq(orderRefunds.id, id), isNull(orderRefunds.sentAt)))
    if (rf.status === 'pending') await enqueue(tx, { tenantId, kind: 'refund.check', dedupeKey: `refund.check:${id}`, payload: { refundId: id }, notBefore: new Date(now.getTime() + 30 * 60_000) })
  })
}

const UUID = /^[0-9a-f-]{36}$/
const idOf = (row: OutboxRow) => { const id = (row.payload as { refundId?: unknown })?.refundId; if (typeof id !== 'string' || !UUID.test(id)) throw new GiveUp('bad payload'); return id }

/** The `refund.send` sender: one attempt, sent once (see the header). */
export async function sendRefund(row: OutboxRow): Promise<void> {
  const tenantId = row.tenantId, id = idOf(row)
  const claim = await withTenant(tenantId, async (tx) => {
    const [r] = await tx.select().from(orderRefunds).where(and(eq(orderRefunds.tenantId, tenantId), eq(orderRefunds.id, id))).for('update')
    if (!r) return null
    if (r.cancelledAt || r.failedAt || r.sentAt) return 'done' as const
    // Claimed, committed before the request: from here an Undo is refused and the attempt is this row's for good.
    if (!r.sendingAt) await tx.update(orderRefunds).set({ sendingAt: new Date() }).where(and(eq(orderRefunds.tenantId, tenantId), eq(orderRefunds.id, id)))
    const [o] = await tx.select({ number: orders.number }).from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.id, r.orderId)))
    return { r, number: o?.number ?? 0, keys: await keysFor(tx, tenantId) }
  })
  if (claim === null) throw new GiveUp('no such refund')
  if (claim === 'done') return
  const { r, keys } = claim
  if (!keys) return void await fail(tenantId, id, 'keys')
  // Listed first: an attempt that went through before (a timeout, a crash) is found by its receipt and never sent twice.
  const listed = await paymentRefunds(keys, r.razorpayPaymentId)
  await noteKeysAnswer(tenantId, keys, listed)
  if (!listed.ok) { if (listed.status === 401 || listed.status === 403) return void await fail(tenantId, id, 'keys'); throw new Later('razorpay unreachable', 5) }
  const mine = listed.items.find((x) => x.receipt === id)
  if (mine) return void await taken(tenantId, id, mine)
  const pay = await fetchPayment(keys, r.razorpayPaymentId)
  if (!pay.ok) throw new Later('razorpay unreachable', 5)
  if (tooOldToRefund(pay.createdAt, new Date())) return void await fail(tenantId, id, 'too_old')
  const given = listed.items.filter((x) => x.status !== 'failed').reduce((a, x) => a + x.amount, 0)
  if (Number(r.amount) > pay.amount - given) return void await fail(tenantId, id, 'over')
  const made = await createRefund(keys, r.razorpayPaymentId, { amount: Number(r.amount), attemptId: id, notes: { order: String(claim.number), edit: r.editId ?? '', cause: r.cause } })
  if (made.ok) return void await taken(tenantId, id, made.refund)
  if (made.why === 'busy') throw new Later('razorpay busy', 1)
  // No answer: counted and tried again; the next try lists first and finds it if it went through.
  if (made.why === 'unreachable') throw new Error('razorpay unreachable')
  await fail(tenantId, id, made.why)
}

/** The `refund.check` sender: a pending refund's state, read back until it is processed or failed (15 days at most). */
export async function sendRefundCheck(row: OutboxRow): Promise<void> {
  const tenantId = row.tenantId, id = idOf(row)
  const pre = await withTenant(tenantId, async (tx) => {
    const [r] = await tx.select().from(orderRefunds).where(and(eq(orderRefunds.tenantId, tenantId), eq(orderRefunds.id, id)))
    return r ? { r, keys: await keysFor(tx, tenantId) } : null
  })
  if (!pre) throw new GiveUp('no such refund')
  const { r, keys } = pre
  if (r.processedAt || r.failedAt || !r.razorpayRefundId) return
  if (!keys) throw new Later('no keys', 60)
  const got = await fetchRefund(keys, r.razorpayPaymentId, r.razorpayRefundId)
  if (!got.ok) throw new Later('razorpay unreachable', 15)
  if (got.refund.status === 'processed') { await withTenant(tenantId, (tx) => tx.update(orderRefunds).set({ processedAt: new Date() }).where(and(eq(orderRefunds.tenantId, tenantId), eq(orderRefunds.id, id), isNull(orderRefunds.processedAt), isNull(orderRefunds.failedAt)))); return }
  if (got.refund.status === 'failed') return void await fail(tenantId, id, 'failed')
  if (Date.now() - new Date(row.createdAt).getTime() > 15 * 86_400_000) throw new GiveUp('still pending after 15 days')
  throw new Later('refund pending', 60)
}

/**
 * Try again (the order page): a new attempt for a refund that failed and was not tried again since, while its payment
 * still has that much left. In the caller's transaction, under the order's lock (the caller's `current`).
 */
export async function retryRefund(tx: Tx, tenantId: string, refundId: string, now: Date): Promise<{ ok: true } | { ok: false; error: string }> {
  const [r] = await tx.select().from(orderRefunds).where(and(eq(orderRefunds.tenantId, tenantId), eq(orderRefunds.id, refundId))).for('update')
  if (!r || !r.failedAt) return { ok: false, error: 'This refund is not waiting to be tried again.' }
  const [again] = await tx.select({ id: orderRefunds.id }).from(orderRefunds).where(and(eq(orderRefunds.tenantId, tenantId), eq(orderRefunds.retryOf, r.id)))
  if (again) return { ok: false, error: 'Already being tried again.' }
  const all = await tx.select().from(orderRefunds).where(and(eq(orderRefunds.tenantId, tenantId), eq(orderRefunds.razorpayPaymentId, r.razorpayPaymentId))).orderBy(desc(orderRefunds.createdAt))
  const captured = await capturedOf(tx, tenantId, r.orderId, r.razorpayPaymentId)
  const left = refundable([{ id: r.razorpayPaymentId, amount: captured, at: now }], all.map((x) => ({ ...x, amount: Number(x.amount) }))).get(r.razorpayPaymentId) ?? 0
  if (Number(r.amount) > left) return { ok: false, error: 'This payment has less left to refund. Check Razorpay.' }
  await queueRefund(tx, tenantId, { orderId: r.orderId, editId: r.editId, cause: r.cause as Queue['cause'], paymentId: r.razorpayPaymentId, amount: Number(r.amount), notBefore: now, retryOf: r.id })
  return { ok: true }
}

/** What one payment of this order captured: the order's own (its online total) or a change's (what it asked). A payment
 * refunded in full because it came too late (after_drop, old_order) captured what its first attempt asked back. */
async function capturedOf(tx: Tx, tenantId: string, orderId: string, paymentId: string): Promise<number> {
  const l = await ledgerIn(tx, tenantId, orderId)
  const own = l?.payments.find((p) => p.id === paymentId)
  if (own) return own.amount
  const [first] = await tx.select({ amount: orderRefunds.amount }).from(orderRefunds)
    .where(and(eq(orderRefunds.tenantId, tenantId), eq(orderRefunds.razorpayPaymentId, paymentId), isNull(orderRefunds.retryOf))).orderBy(asc(orderRefunds.createdAt)).limit(1)
  return Number(first?.amount ?? 0)
}
