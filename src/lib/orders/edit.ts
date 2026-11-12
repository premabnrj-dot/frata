import 'server-only'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { classOf } from '@/domains/checkout/discounts'
import { cannotEdit, priceAsKept, undoUntil, usesOn, type EditReason, type Want } from '@/domains/orders/edit'
import { currentMethod } from '@/domains/orders/order-state'
import { dueOf, settleOf } from '@/domains/orders/refunds'
import { chargesGst, type Scheme } from '@/domains/tax/gst'
import type { Tx } from '@/lib/db'
import { orderDiscounts } from '@/lib/db/schema-discounts'
import { orderEditLines, orderEdits } from '@/lib/db/schema-edits'
import { orderEvents, orderLines, orders } from '@/lib/db/schema-orders'
import { enqueueOrderEmail } from '@/lib/email/enqueue'
import { cancelEditRefunds, queueRefund } from '@/lib/payments/refunds'
import { editVariantIds, type LiveLine } from './edit-facts'
import { requestPayment, waitingEdit } from './edit-paid'
import { applyPlan, inr, planLocked, rearrive, Refused, stillFit } from './edit-write'
import { writeReprice } from './reprice'
import { lockVariants, putStockBackLines, takeStockLines } from './stock'
import { current, moment, record, type Actor, type Done } from './work'

// =============================================================================
// FILE: src/lib/orders/edit.ts
//
// SAVE AND UNDO AN ITEMS EDIT (OE·1: pay on delivery and unpaid; OE·2: paid online; plan docs/plans/2026-11-12-order-edit.md).
// Inside the console action's tenant transaction, under the order's lock (current()), as every order write: the plan is
// the browser's own (domains/orders/edit.ts) made again from facts read after every touched variant is locked, and
// refused when its total differs from what Save showed (edit-write.ts planLocked). Lines and offers are never
// rewritten (edit-write.ts applyPlan). One items_edited event, the edit's record (order_edits, order_edit_lines) and,
// when asked, an `edited` email that waits out the Undo window. A refusal rolls the savepoint back: nothing is written.
// Paid online (OE·2), what the new total means for the money already paid (domains/orders/refunds.ts settleOf), as Save
// showed it (`expectedDue`, compared): lower → the edit applies and its refund is queued in this transaction, sent when
// the Undo window ends (an Undo before then cancels it; once it is sent the edit has no Undo); higher → the edit WAITS
// for the shopper's payment and nothing on the order changes yet (edit-paid.ts); within ₹1 → it applies, nothing moves.
// Refused: a support visit, packed or later, a change already waiting for payment (cannotEdit).
// =============================================================================

export type EditInput = { want: Want[]; reasons: Record<string, EditReason | undefined>; notify: boolean; expectedTotal: number
  /** Paid online: the refund (+) or the payment asked for (−) that Save showed (refunds.ts dueOf). */
  expectedDue?: number }
export type Edited = Done<{ total: number; soldOut: string[]; backInStock: string[]; asked?: number; refund?: number }> | { ok: false; error: string; total?: number }

/** A support visit changes no order's items: the shop's own people do (it moves stock and the amount collected). */
const SUPPORT = 'A support visit can\'t change an order\'s items.'

/** Why this order's items can't change now (cannotEdit), with a change waiting for payment read under its lock. */
async function notEditable(tx: Tx, tenantId: string, orderId: string, c: NonNullable<Awaited<ReturnType<typeof current>>>): Promise<string | null> {
  return cannotEdit(c.state, { waiting: !!(await waitingEdit(tx, tenantId, orderId)) })
}

/** Save an items edit. `soldOut` / `backInStock` gather the variants to refresh on the shop after the commit. */
export async function editItems(tx: Tx, tenantId: string, actor: Actor, orderId: string, input: EditInput, now = new Date()): Promise<Edited> {
  if (actor.kind === 'support') return { ok: false, error: SUPPORT }
  const c = await current(tx, tenantId, orderId, now)
  if (!c) return { ok: false, error: 'Order not found.' }
  const why = await notEditable(tx, tenantId, orderId, c)
  if (why) return { ok: false, error: why }
  try {
    return await tx.transaction(async (sp) => {
      const { read, p } = await planLocked(sp, tenantId, orderId, input.want, input.reasons, now)
      const { facts, live } = read
      if (p.total.after !== input.expectedTotal) throw new Refused(`The new total is ${inr(p.total.after)}. Check it, then save again.`, p.total.after)
      const way = facts.order.way
      // A saving that grew is a bigger use of its offer: it must still fit its budget.
      const grew = p.offers.flatMap((x) => { const o = facts.offers!.find((k) => k.rowId === x.rowId)!.kept
        return x.after > x.before && usesOn(way)({ class: classOf(o.terms.style), method: o.method }) ? [{ discountId: o.terms.id, amount: x.after, title: x.title }] : [] })
      const short = await stillFit(sp, tenantId, orderId, grew, now)
      if (short) throw new Refused(`${short} has no room for a bigger saving. Keep the order as it was.`)
      // Paid online: refund the difference, or ask for it first (refunds.ts), exactly as Save showed it.
      const settle = settleOf(p.total.after, facts.paid, now)
      if (input.expectedDue !== undefined && dueOf(settle) !== input.expectedDue) throw new Refused('What it refunds or asks for changed. Check it, then save again.', p.total.after)
      if (settle.kind === 'too_old') throw new Refused('Paid over 6 months ago: Razorpay can\'t refund it. Keep the order as it was.')
      if (settle.kind === 'ask') return requestPayment(sp, tenantId, actor, orderId, p, read, settle.amount, input, now)

      const w = await applyPlan(sp, tenantId, orderId, p, read, now)
      const stamp = moment(now)
      const eventId = await record(sp, tenantId, orderId, actor, 'items_edited', stamp)
      const [edit] = await sp.insert(orderEdits).values({ tenantId, orderId, eventId, totalBefore: p.total.before, totalAfter: p.total.after, shippingBefore: p.shipping.before,
        shippingAfter: p.shipping.after, notify: input.notify, offersRemoved: w.moved, offersAdded: w.added }).returning({ id: orderEdits.id })
      const reasonOf = new Map(p.removed.map((x) => [x.line.id, x.reason]))
      await sp.insert(orderEditLines).values([
        ...live.map((l) => ({ tenantId, editId: edit!.id, side: 'before', orderLineId: l.id, variantId: l.variantId, qty: l.qty, unitPrice: l.unitPrice, productDiscount: l.productDiscount, lineDiscount: l.lineDiscount, reason: reasonOf.get(l.id) ?? null })),
        ...p.lines.map((l, i) => ({ tenantId, editId: edit!.id, side: 'after', orderLineId: w.lineIds[i]!, variantId: l.variantId, qty: l.qty, unitPrice: l.unitPrice,
          productDiscount: p.price.lines[i]!.productDiscount, lineDiscount: p.price.lines[i]!.discount, replaces: l.change === 'kept' || !l.from ? null : l.from.id })),
      ])
      // The refund waits out the Undo window (an Undo before then cancels it in its own transaction).
      if (settle.kind === 'refund') for (const part of settle.parts) {
        await queueRefund(sp, tenantId, { orderId, editId: edit!.id, cause: 'edit', paymentId: part.paymentId, amount: part.amount, notBefore: undoUntil(stamp) })
      }
      if (input.notify) await enqueueOrderEmail(sp, tenantId, orderId, 'edited', eventId, now)
      return { ok: true as const, eventId, total: p.total.after, soldOut: w.soldOut, backInStock: w.backInStock, ...(settle.kind === 'refund' ? { refund: settle.amount } : {}) }
    })
  } catch (e) {
    if (e instanceof Refused) return e.total === undefined ? { ok: false, error: e.words } : { ok: false, error: e.words, total: e.total }
    throw e
  }
}

/**
 * Undo an items edit: its lines and offers back exactly as they were, their pieces taken again, the price they had.
 * Within UNDO_MINUTES of the edit, before packing, and only while the order still has the lines and offers the edit left
 * (a later edit is undone first). An offer the edit took off comes back only if it still fits (its use was free
 * meanwhile); a piece that sold meanwhile refuses it.
 */
export async function undoEdit(tx: Tx, tenantId: string, actor: Actor, eventId: string, now = new Date()): Promise<Edited> {
  if (actor.kind === 'support') return { ok: false, error: SUPPORT }
  const [e] = await tx.select({ id: orderEdits.id, orderId: orderEdits.orderId, at: orderEvents.at, shippingBefore: orderEdits.shippingBefore, totalBefore: orderEdits.totalBefore,
    removed: orderEdits.offersRemoved, added: orderEdits.offersAdded, asked: orderEdits.asked }).from(orderEdits)
    .innerJoin(orderEvents, and(eq(orderEvents.tenantId, orderEdits.tenantId), eq(orderEvents.id, orderEdits.eventId)))
    .where(and(eq(orderEdits.tenantId, tenantId), eq(orderEdits.eventId, eventId)))
  // A change the shopper paid for has no Undo (its way out was "Ship without the change" while it waited).
  if (!e || e.asked !== null) return { ok: false, error: 'There is nothing to undo.' }
  const c = await current(tx, tenantId, e.orderId, now)
  if (!c) return { ok: false, error: 'Order not found.' }
  const [already] = await tx.select({ id: orderEvents.id }).from(orderEvents).where(and(eq(orderEvents.tenantId, tenantId), eq(orderEvents.undoes, eventId)))
  if (already) return { ok: false, error: 'Already undone.' }
  const why = await notEditable(tx, tenantId, e.orderId, c)
  if (why) return { ok: false, error: why }
  if (now > undoUntil(e.at)) return { ok: false, error: 'The 10 minutes to undo have passed. Edit the items instead.' }
  try {
    return await tx.transaction(async (sp) => {
      // Its refund, not yet with Razorpay, is cancelled first; one already sent means the edit stands.
      if (!(await cancelEditRefunds(sp, tenantId, e.id, now))) throw new Refused('The refund has gone to Razorpay: this change can\'t be undone.')
      const sides = await sp.select().from(orderEditLines).where(and(eq(orderEditLines.tenantId, tenantId), eq(orderEditLines.editId, e.id)))
      // An edit that applied at once names every line it saw and left (only a waiting one leaves a line unnamed).
      const named = sides.map((s) => ({ ...s, orderLineId: s.orderLineId! }))
      const before = named.filter((s) => s.side === 'before'), after = named.filter((s) => s.side === 'after')
      await lockVariants(sp, tenantId, await editVariantIds(sp, tenantId, e.orderId))
      const live = await sp.select().from(orderLines).where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.orderId, e.orderId), isNull(orderLines.removedAt)))
      const liveOffers = await sp.select({ id: orderDiscounts.id }).from(orderDiscounts).where(and(eq(orderDiscounts.tenantId, tenantId), eq(orderDiscounts.orderId, e.orderId), isNull(orderDiscounts.removedAt)))
      const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))
      const offersAfter = [...liveOffers.map((o) => o.id)]
      if (!same(live.map((l) => l.id), after.map((s) => s.orderLineId)) || !e.added.every((id) => offersAfter.includes(id)) || e.removed.some((id) => offersAfter.includes(id))) {
        throw new Refused('Its items changed again since. Undo the later change first.')
      }
      const stamp = moment(now)
      const goes = after.filter((s) => !before.some((b) => b.orderLineId === s.orderLineId)).map((s) => s.orderLineId)
      const comes = before.filter((b) => !after.some((s) => s.orderLineId === b.orderLineId)).map((b) => b.orderLineId)
      const backInStock = await putStockBackLines(sp, tenantId, goes)
      if (goes.length) await sp.update(orderLines).set({ removedAt: stamp }).where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.orderId, e.orderId), inArray(orderLines.id, goes)))
      if (comes.length) await sp.update(orderLines).set({ removedAt: null, replacedBy: null }).where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.orderId, e.orderId), inArray(orderLines.id, comes)))
      const restored = await sp.select().from(orderLines).where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.orderId, e.orderId), isNull(orderLines.removedAt)))
      const soldOut: string[] = []
      const take = restored.filter((l) => comes.includes(l.id) && l.kind === 'in_stock').map((l) => l.id)
      if ((await takeStockLines(sp, tenantId, take, soldOut)).short) throw new Refused('A piece it had sold out since: Undo can\'t put it back. Edit the items instead.')

      if (e.added.length) await sp.update(orderDiscounts).set({ removedAt: stamp }).where(and(eq(orderDiscounts.tenantId, tenantId), eq(orderDiscounts.orderId, e.orderId), inArray(orderDiscounts.id, e.added)))
      if (e.removed.length) await sp.update(orderDiscounts).set({ removedAt: null }).where(and(eq(orderDiscounts.tenantId, tenantId), eq(orderDiscounts.orderId, e.orderId), inArray(orderDiscounts.id, e.removed)))
      const offers = await sp.select().from(orderDiscounts).where(and(eq(orderDiscounts.tenantId, tenantId), eq(orderDiscounts.orderId, e.orderId), isNull(orderDiscounts.removedAt)))
      const way = currentMethod(c.o)
      const back = offers.filter((o) => e.removed.includes(o.id) && usesOn(way)(o)).map((o) => ({ discountId: o.discountId, amount: Number(o.amount), title: o.title }))
      const gone = await stillFit(sp, tenantId, e.orderId, back, now)
      if (gone) throw new Refused(`${gone} ran out since: Undo would give it again. Edit the items instead.`)

      // The lines as they were (the before rows' product discounts), in position order, priced as they had been.
      const lines = [...restored].sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1))
      const pd = new Map(before.map((b) => [b.orderLineId, Number(b.productDiscount)]))
      const [o] = await sp.select({ codCharge: orders.codCharge, pricesIncludeGst: orders.pricesIncludeGst, placedAt: orders.placedAt, sellerGstin: orders.sellerGstin, sellerScheme: orders.sellerScheme })
        .from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.id, e.orderId)))
      const price = priceAsKept(lines.map((l) => ({ unitPrice: Number(l.unitPrice), qty: l.qty, hsn: l.hsn, gstBps: l.gstBps, productDiscount: pd.get(l.id) ?? 0 })),
        offers.map((x) => ({ class: x.class, method: x.method, amount: Number(x.amount) })), { shipping: Number(e.shippingBefore), codCharge: Number(o!.codCharge) },
        { registered: chargesGst({ gstin: o!.sellerGstin, scheme: (o!.sellerScheme ?? 'regular') as Scheme }), pricesIncludeGst: o!.pricesIncludeGst, placedAt: o!.placedAt }, way)
      // The price the order had: anything else means the order moved in a way this Undo does not know (never written).
      if (price.total !== Number(e.totalBefore)) throw new Refused('Its money changed since. Edit the items instead.')
      const cogs = lines.every((l) => l.unitCost !== null) ? lines.reduce((a, l: LiveLine) => a + Number(l.unitCost) * l.qty, 0) : null
      await writeReprice(sp, tenantId, e.orderId, lines.map((l) => l.id), { ...price, codCharge: way === 'cod' ? Number(o!.codCharge) : 0 },
        { subtotal: lines.reduce((a, l) => a + Number(l.unitPrice) * l.qty, 0), shipping: Number(e.shippingBefore), cogs })
      await rearrive(sp, tenantId, e.orderId, now)
      const undone = await record(sp, tenantId, e.orderId, actor, 'undone', stamp, { undoes: eventId, reason: 'items_edited' })
      return { ok: true as const, eventId: undone, total: price.total, soldOut, backInStock }
    })
  } catch (err) {
    if (err instanceof Refused) return { ok: false, error: err.words }
    throw err
  }
}
