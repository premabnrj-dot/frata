import 'server-only'
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, ne, notExists, sql } from 'drizzle-orm'
import { AUTO_RETRIES, canRetry, chainLength, paidNet, refundable, tooOldToRefund, type Paid, type RefundRow } from '@/domains/orders/refunds'
import type { Tx } from '@/lib/db'
import { editWaitingSql } from '@/lib/db/order-predicates'
import { outbox } from '@/lib/db/schema'
import { orderEdits, orderRefunds, REFUND_CAUSES } from '@/lib/db/schema-edits'
import { orders } from '@/lib/db/schema-orders'
import { withTenant } from '@/lib/db/tenant'
import { enqueue, GiveUp, Later, MAX_ATTEMPTS, type OutboxRow } from '@/lib/outbox'
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
// as a NEW attempt (a new receipt and key), by itself up to AUTO_RETRIES times, then by Try again — unless a later change
// of the order settled it instead (superseded_by: its total was worked out without that money going back; security
// review 2026-11-12 H1; only the failed ones the change's own plan counted as not going back). An attempt the sender leaves
// unresolved (no answer on its last try, or its outbox row dead after an error) stays on its way — counted, never offered
// again, never settled by a later change — until the check queued with its claim reads Razorpay's list: its receipt (or
// an earlier one of its chain) there → recorded; absent → failed, so Try again appears (security re-review M3, L4).
// A payment refunded in full (after_drop, old_order) costs the shop Razorpay's fee on it: recorded once on its first
// attempt and added to the order's gateway_fee (profit per order; unit-economics review 2026-11-12).
// =============================================================================

export type Ledger = { payments: Paid[]; refunds: RefundRow[] }

/** The payments that paid this order (its own, and each change it paid for since), with Razorpay's fee on each once
 * known, and every refund attempt on it. Null: not paid online (or paid before its online total was stored). */
export async function ledgerIn(tx: Tx, tenantId: string, orderId: string): Promise<Ledger | null> {
  const [[o], edits, rows] = await Promise.all([
    tx.select({ paidAt: orders.paidAt, paymentId: orders.razorpayPaymentId, fee: orders.gatewayFee, online: sql<number | null>`(${orders.checkout}->>'onlineTotal')::bigint`.mapWith((v) => (v == null ? null : Number(v))) })
      .from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId))),
    tx.select({ id: orderEdits.razorpayPaymentId, amount: orderEdits.asked, at: orderEdits.paidAt, fee: orderEdits.gatewayFee }).from(orderEdits)
      .where(and(eq(orderEdits.tenantId, tenantId), eq(orderEdits.orderId, orderId), isNotNull(orderEdits.paidAt))),
    tx.select().from(orderRefunds).where(and(eq(orderRefunds.tenantId, tenantId), eq(orderRefunds.orderId, orderId))).orderBy(asc(orderRefunds.createdAt)),
  ])
  if (!o?.paidAt || !o.paymentId || o.online === null) return null
  // The order's gateway_fee holds its own payment's fee plus every later one's (edit-paid.ts editFeesSql).
  const extra = edits.reduce((a, e) => a + Number(e.fee ?? 0), 0) + rows.reduce((a, r) => a + Number(r.gatewayFee ?? 0), 0)
  return {
    payments: [{ id: o.paymentId, amount: o.online, at: o.paidAt, fee: o.fee === null ? null : Number(o.fee) - extra },
      ...edits.map((e) => ({ id: e.id!, amount: Number(e.amount), at: e.at!, fee: e.fee === null ? null : Number(e.fee) }))],
    refunds: rows.map((r) => ({ ...r, amount: Number(r.amount) })),
  }
}

/**
 * A later change of this order settled the failed `edit` refunds its own plan counted as not going back (its total was
 * worked out with that money still with the shop): they are marked so and never tried again (security review H1). ONLY
 * those: `ids`, the failed ones in the facts an applied edit was planned from, or, for a change paid later, the ones that
 * had failed before it was saved (`failedBefore`). One failing after the plan was counted as on its way: still owed
 * (security re-review 2026-11-12 H1), and a fail that races the plan can't be swept in with them.
 */
export async function supersedeFailed(tx: Tx, tenantId: string, orderId: string, editId: string, which: { ids: string[] } | { failedBefore: Date }): Promise<void> {
  if ('ids' in which && !which.ids.length) return
  const again = tx.select({ id: sql`1` }).from(sql`order_refunds n`).where(sql`n.tenant_id = ${tenantId} and n.retry_of = ${orderRefunds.id}`)
  await tx.update(orderRefunds).set({ supersededBy: editId }).where(and(eq(orderRefunds.tenantId, tenantId), eq(orderRefunds.orderId, orderId), eq(orderRefunds.cause, 'edit'),
    isNotNull(orderRefunds.failedAt), isNull(orderRefunds.supersededBy), ne(orderRefunds.editId, editId), notExists(again),
    'ids' in which ? inArray(orderRefunds.id, which.ids) : lt(orderRefunds.failedAt, which.failedBefore)))
}

/** Razorpay's fee (with its GST) on a cost the order now carries: added to its gateway_fee. A paid order whose own fee is
 * not known yet gets it with that fee (payment.ts markPaid sums editFeesSql); an order never paid online starts at 0. */
export async function addOrderFee(tx: Tx, tenantId: string, orderId: string, fee: number, tax: number | null) {
  await tx.update(orders).set({ gatewayFee: sql`case when ${orders.paidAt} is null then coalesce(${orders.gatewayFee}, 0) else ${orders.gatewayFee} end + ${fee}`,
    gatewayTax: sql`coalesce(${orders.gatewayTax}, 0) + ${tax ?? 0}` })
    .where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId), sql`(${orders.paidAt} is null or ${orders.gatewayFee} is not null)`))
}

/** A payment refunded in full (after_drop, old_order): Razorpay's fee on it, on its first attempt and the order, once. */
export async function recordRefundedFee(tx: Tx, tenantId: string, orderId: string, paymentId: string, fee: number | null | undefined, tax: number | null | undefined) {
  if (fee == null) return
  const r = await tx.update(orderRefunds).set({ gatewayFee: fee, gatewayTax: tax ?? null }).where(and(eq(orderRefunds.tenantId, tenantId), eq(orderRefunds.orderId, orderId),
    eq(orderRefunds.razorpayPaymentId, paymentId), isNull(orderRefunds.retryOf), ne(orderRefunds.cause, 'edit'), isNull(orderRefunds.gatewayFee))).returning({ id: orderRefunds.id })
  if (r.length) await addOrderFee(tx, tenantId, orderId, fee, tax ?? null)
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
  // Under the order's lock, stamped once it is had: a change planned under that lock either saw this failure (failed
  // before it, so it may settle it) or did not (failed after it, still owed) — never a failure it didn't see stamped as
  // before it (security re-review 2026-11-12 H1).
  await tx.execute(sql`select 1 from orders where tenant_id = ${tenantId} and id = (select order_id from order_refunds where tenant_id = ${tenantId} and id = ${id}) for update`)
  await tx.update(orderRefunds).set({ failedAt: sql`clock_timestamp()`, failure }).where(and(eq(orderRefunds.tenantId, tenantId), eq(orderRefunds.id, id), isNull(orderRefunds.failedAt), isNull(orderRefunds.processedAt)))
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
    // Claimed, committed before the request: from here an Undo is refused and the attempt is this row's for good. With
    // the claim, a check that settles it whatever happens next (a lost answer, a dead outbox row: security re-review
    // M3, L4): it reads Razorpay's list once the sender is done or gone.
    const tried = !!r.sendingAt
    if (!r.sendingAt) {
      await tx.update(orderRefunds).set({ sendingAt: new Date() }).where(and(eq(orderRefunds.tenantId, tenantId), eq(orderRefunds.id, id)))
      await enqueue(tx, { tenantId, kind: 'refund.check', dedupeKey: `refund.settle:${id}`, payload: { refundId: id }, notBefore: new Date(Date.now() + SETTLE_MINUTES * 60_000) })
    }
    const chain = await chainIds(tx, tenantId, r)
    const [o] = await tx.select({ number: orders.number }).from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.id, r.orderId)))
    return { r, chain, tried, number: o?.number ?? 0, keys: await keysFor(tx, tenantId) }
  })
  if (claim === null) throw new GiveUp('no such refund')
  if (claim === 'done') return
  const { r, keys } = claim
  if (!keys) return void await fail(tenantId, id, 'keys')
  // Listed first: an attempt that went through before (a timeout, a crash) is found by its receipt and never sent twice.
  const listed = await paymentRefunds(keys, r.razorpayPaymentId)
  await noteKeysAnswer(tenantId, keys, listed)
  if (!listed.ok) { if (listed.status === 401 || listed.status === 403) return void await fail(tenantId, id, 'keys'); throw new Later('razorpay unreachable', 5) }
  // This attempt, or an earlier one of its chain that Razorpay made after all (its answer lost): never sent twice.
  const mine = listed.items.find((x) => x.receipt === id) ?? listed.items.find((x) => x.status !== 'failed' && x.receipt !== null && claim.chain.includes(x.receipt))
  if (mine) return void await taken(tenantId, id, mine)
  // The last try after an earlier one went unanswered: that create may still be in flight, so none is made again — it
  // stays on its way for the claim's check (impact re-review 2026-11-12).
  if (claim.tried && row.attempts >= MAX_ATTEMPTS) return
  const pay = await fetchPayment(keys, r.razorpayPaymentId)
  if (!pay.ok) throw new Later('razorpay unreachable', 5)
  if (tooOldToRefund(pay.createdAt, new Date())) return void await fail(tenantId, id, 'too_old')
  const given = listed.items.filter((x) => x.status !== 'failed').reduce((a, x) => a + x.amount, 0)
  if (Number(r.amount) > pay.amount - given) return void await fail(tenantId, id, 'over')
  const made = await createRefund(keys, r.razorpayPaymentId, { amount: Number(r.amount), attemptId: id, notes: { order: String(claim.number), edit: r.editId ?? '', cause: r.cause } })
  if (made.ok) return void await taken(tenantId, id, made.refund)
  if (made.why === 'busy') throw new Later('razorpay busy', 1)
  if (made.why !== 'unreachable') return void await fail(tenantId, id, made.why)
  // No answer: counted and tried again; the next try lists first and finds it if it went through. On the row's last try
  // it is NOT failed (Razorpay may have made it and not list it yet: security re-review M3): it stays on its way — counted,
  // never offered again, never settled by a later change — until the claim's check reads the list (sendRefundCheck).
  if (row.attempts < MAX_ATTEMPTS) throw new Error('razorpay unreachable')
}

/** How long after a claim its check settles an attempt the sender left unresolved. */
export const SETTLE_MINUTES = 30

/** The receipts of this attempt's chain: itself and every attempt it tries again. */
async function chainIds(tx: Tx, tenantId: string, r: { id: string; orderId: string; retryOf: string | null }): Promise<string[]> {
  if (!r.retryOf) return [r.id]
  const rows = await tx.select({ id: orderRefunds.id, retryOf: orderRefunds.retryOf }).from(orderRefunds).where(and(eq(orderRefunds.tenantId, tenantId), eq(orderRefunds.orderId, r.orderId)))
  const out = [r.id]
  let at = r.retryOf as string | null
  while (at && !out.includes(at)) { out.push(at); at = rows.find((x) => x.id === at)?.retryOf ?? null }
  return out
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
  if (r.processedAt || r.failedAt || r.cancelledAt) return
  if (!r.razorpayRefundId) {
    if (!r.sendingAt) return
    return settleUnresolved(row, r, keys)
  }
  if (!keys) throw new Later('no keys', 60)
  const got = await fetchRefund(keys, r.razorpayPaymentId, r.razorpayRefundId)
  if (!got.ok) throw new Later('razorpay unreachable', 15)
  if (got.refund.status === 'processed') { await withTenant(tenantId, (tx) => tx.update(orderRefunds).set({ processedAt: new Date() }).where(and(eq(orderRefunds.tenantId, tenantId), eq(orderRefunds.id, id), isNull(orderRefunds.processedAt), isNull(orderRefunds.failedAt)))); return }
  if (got.refund.status === 'failed') return void await fail(tenantId, id, 'failed')
  if (Date.now() - new Date(row.createdAt).getTime() > 15 * 86_400_000) throw new GiveUp('still pending after 15 days')
  throw new Later('refund pending', 60)
}

/**
 * An attempt claimed and still unresolved (the sender's answer lost on its last try, or its outbox row dead after an
 * error): settled by Razorpay's list once the sender is done or gone — its receipt (or an earlier one of its chain)
 * there → recorded; absent → failed as refused, and Try again appears. Razorpay not answering → asked again later.
 */
async function settleUnresolved(row: OutboxRow, r: typeof orderRefunds.$inferSelect, keys: Awaited<ReturnType<typeof keysFor>>) {
  const tenantId = row.tenantId
  const [sender] = await withTenant(tenantId, (tx) => tx.select({ sentAt: outbox.sentAt, deadAt: outbox.deadAt }).from(outbox)
    .where(and(eq(outbox.tenantId, tenantId), eq(outbox.dedupeKey, `refund.send:${r.id}`))))
  // The sender is still trying: let it.
  if (sender && !sender.sentAt && !sender.deadAt) throw new Later('refund still being sent', 30)
  if (!keys) throw new Later('no keys', 60)
  // A ceiling: a week of Razorpay not answering leaves it for a person (logged; it still shows "with Razorpay").
  if (Date.now() - new Date(row.createdAt).getTime() > 7 * 86_400_000) throw new GiveUp('unresolved after 7 days')
  const chain = await withTenant(tenantId, (tx) => chainIds(tx, tenantId, r))
  const list = await paymentRefunds(keys, r.razorpayPaymentId)
  if (!list.ok) throw new Later('razorpay unreachable', 15)
  const found = list.items.find((x) => x.receipt === r.id) ?? list.items.find((x) => x.status !== 'failed' && x.receipt !== null && chain.includes(x.receipt))
  await (found ? taken(tenantId, r.id, found) : fail(tenantId, r.id, 'refused'))
}

/**
 * Try again (the order page): a new attempt for a refund that failed and was not tried again since, while its payment
 * still has that much left. In the caller's transaction, under the order's lock (the caller's `current`).
 */
export async function retryRefund(tx: Tx, tenantId: string, refundId: string, now: Date): Promise<{ ok: true } | { ok: false; error: string }> {
  const [r] = await tx.select().from(orderRefunds).where(and(eq(orderRefunds.tenantId, tenantId), eq(orderRefunds.id, refundId))).for('update')
  if (!r || !r.failedAt) return { ok: false, error: 'This refund is not waiting to be tried again.' }
  if (r.supersededBy) return { ok: false, error: 'A later change of this order settled it. Nothing to send.' }
  if (!canRetry(r)) return { ok: false, error: 'Razorpay won\'t take this refund. Check Razorpay.' }
  const [again] = await tx.select({ id: orderRefunds.id }).from(orderRefunds).where(and(eq(orderRefunds.tenantId, tenantId), eq(orderRefunds.retryOf, r.id)))
  if (again) return { ok: false, error: 'Already being tried again.' }
  const all = await tx.select().from(orderRefunds).where(and(eq(orderRefunds.tenantId, tenantId), eq(orderRefunds.razorpayPaymentId, r.razorpayPaymentId))).orderBy(desc(orderRefunds.createdAt))
  const captured = await capturedOf(tx, tenantId, r.orderId, r.razorpayPaymentId)
  const left = refundable([{ id: r.razorpayPaymentId, amount: captured, at: now }], all.map((x) => ({ ...x, amount: Number(x.amount) }))).get(r.razorpayPaymentId) ?? 0
  if (Number(r.amount) > left) return { ok: false, error: 'This payment has less left to refund. Check Razorpay.' }
  // An edit's refund: only while the shopper's payments still hold that much over what the order is now (or the total a
  // change waiting for payment would make it): a later change may have settled it (security review 2026-11-12 H1).
  if (r.cause === 'edit') {
    const l = await ledgerIn(tx, tenantId, r.orderId)
    // A change waiting for payment: what the shop holds once it is paid is its total, so what it may still give back is
    // measured against its total less what it asks (a refund it counted as on its way is still owed; one it counted as
    // not going back is not: security re-review 2026-11-12 H1).
    const [o] = await tx.select({ total: orders.total, waiting: sql<string | null>`(select e.total_after - e.asked from order_edits e where e.tenant_id = ${tenantId} and e.order_id = ${r.orderId} and ${editWaitingSql('e', '"orders"')} limit 1)` })
      .from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.id, r.orderId)))
    const target = o?.waiting != null ? Number(o.waiting) : Number(o?.total ?? 0)
    if (!l || paidNet(l.payments, l.refunds) - target < Number(r.amount)) return { ok: false, error: 'A later change of this order settled it. Nothing to send.' }
  }
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
