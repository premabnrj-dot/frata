import 'server-only'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { classOf } from '@/domains/checkout/discounts'
import { inOrder, planEdit, priceAsKept, problemWords, undoUntil, usesOnCod, type EditReason, type Want } from '@/domains/orders/edit'
import { chargesGst, type Scheme } from '@/domains/tax/gst'
import { currentMethod } from '@/domains/orders/order-state'
import { applies } from '@/domains/orders/work'
import type { QuoteLine } from '@/domains/checkout/quote'
import { formatInr } from '@/lib/format'
import type { Paise } from '@/domains/money/paise'
import type { Tx } from '@/lib/db'
import { discountUses, fits } from '@/lib/db/discount-predicates'
import { discounts, orderDiscounts } from '@/lib/db/schema-discounts'
import { orderEditLines, orderEdits } from '@/lib/db/schema-edits'
import { orderEvents, orderLines, orders } from '@/lib/db/schema-orders'
import { withTenant } from '@/lib/db/tenant'
import { enqueueOrderEmail } from '@/lib/email/enqueue'
import { keysFor, noteKeysAnswer } from '@/lib/payments/keys'
import { orderPayments } from '@/lib/payments/razorpay'
import { editFactsIn, editVariantIds, sellsAs, type LiveLine } from './edit-facts'
import { lineSnapshot, unitCosts } from './lines'
import { storeRazorpayEvent } from './payment'
import { writeReprice } from './reprice'
import { lockVariants, putStockBackLines, takeStockLines } from './stock'
import { current, moment, record, type Actor, type Done } from './work'

// =============================================================================
// FILE: src/lib/orders/edit.ts
//
// SAVE AND UNDO AN ITEMS EDIT (OE·1: pay on delivery and unpaid; plan docs/plans/2026-11-12-order-edit.md). Inside the
// console action's tenant transaction, under the order's lock (current()), as every order write: the plan is the
// browser's own (domains/orders/edit.ts) made again from facts read after every touched variant is locked, and refused
// when its total differs from what Save showed. Lines and offers are never rewritten: a line comes out (removed_at,
// replaced_by) and its successor is inserted; an offer that comes off or gives another amount gets removed_at (a new
// row carries a new amount). Stock moves per line (stock.ts): the pieces coming out go back first, then the new ones
// are taken. Every money column is written together (writeReprice), so Frrata's fee follows merchandise_net. One
// items_edited event, the edit's record (order_edits, order_edit_lines) and, when asked, an `edited` email that waits
// out the Undo window. A refusal rolls the savepoint back: nothing is written.
// Refused: a support visit (the action), packed or later, paid online (OE·2), a Razorpay payment that may still capture.
// =============================================================================

export type EditInput = { want: Want[]; reasons: Record<string, EditReason | undefined>; notify: boolean; expectedTotal: number }
export type Edited = Done<{ total: number; soldOut: string[]; backInStock: string[] }> | { ok: false; error: string; total: number }

class Refused extends Error { constructor(readonly words: string, readonly total?: number) { super('refused') } }
const inr = (p: number) => formatInr(p as Paise)
/** A support visit changes no order's items: the shop's own people do (it moves stock and the amount collected). */
const SUPPORT = 'A support visit can\'t change an order\'s items.'

/**
 * Before the transaction (never a call out inside one): an order switched to pay on delivery from an online payment can
 * still be captured while Razorpay holds a payment created or authorized for it — an edit then would collect cash for
 * a paid order. A capture found is recorded (applied by the next pass, as a switch does). Null: nothing open.
 */
export async function paymentStillOpen(tenantId: string, orderId: string): Promise<string | null> {
  const pre = await withTenant(tenantId, async (tx) => {
    const [o] = await tx.select({ rzp: orders.razorpayOrderId, paidAt: orders.paidAt, switchedAt: orders.switchedToCodAt }).from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId)))
    return { o, keys: o?.rzp && o.switchedAt && !o.paidAt ? await keysFor(tx, tenantId) : null }
  })
  if (!pre.o?.rzp || !pre.o.switchedAt || pre.o.paidAt) return null
  if (!pre.keys) return 'We could not check with Razorpay whether its online payment is still open. Connect Razorpay again, then edit.'
  const asked = await orderPayments(pre.keys, pre.o.rzp)
  await noteKeysAnswer(tenantId, pre.keys, asked)
  if (!asked.ok) return 'We could not check with Razorpay whether its online payment is still open. Try again in a minute.'
  const captured = asked.items.find((p) => p.status === 'captured')
  if (captured) {
    await storeRazorpayEvent(tenantId, `razorpay:payment.captured:${captured.id}`, { event: 'payment.captured',
      payload: { payment: { entity: { id: captured.id, order_id: pre.o.rzp, amount: captured.amount, currency: 'INR', status: 'captured', fee: captured.fee, tax: captured.tax } } } })
    return 'It was paid online after all: reload the order.'
  }
  if (asked.items.some((p) => p.status === 'created' || p.status === 'authorized')) return 'An online payment for it is still going through in Razorpay. Try again in a few minutes.'
  return null
}

/** Why this order's items can't change now, or null. */
function notEditable(state: string, o: { paidAt: Date | null } & Parameters<typeof currentMethod>[0]): string | null {
  if (!applies('edit', state as Parameters<typeof applies>[1])) return state === 'packed' || state === 'shipped' ? 'Already packed: its slip and invoice keep these items.' : `This order is ${state.replace('_', ' ')}.`
  if (o.paidAt || currentMethod(o) !== 'cod') return 'Paid online: its items can\'t be changed here yet.'
  return null
}

/** The limited offers among `rows` whose new use must fit (limits and budgets), the order's own use left out. */
async function stillFit(tx: Tx, tenantId: string, orderId: string, uses: { discountId: string; amount: number; title: string }[], now: Date): Promise<string | null> {
  if (!uses.length) return null
  const ids = [...new Set(uses.map((u) => u.discountId))]
  const limited = await tx.execute<{ id: string; limit_total: number | null; limit_per_phone: number | null; budget: string | null }>(sql`
    select id, limit_total, limit_per_phone, budget from ${discounts} where tenant_id = ${tenantId} and id in ${ids}
      and (limit_total is not null or limit_per_phone is not null or budget is not null) order by id for update`)
  if (!limited.length) return null
  const [o] = await tx.select({ phone: orders.phone }).from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId)))
  const used = await discountUses(tx, tenantId, limited.map((l) => l.id), now, { phone: o?.phone ?? '', excludeOrder: orderId })
  const bad = limited.find((l) => !fits({ limitTotal: l.limit_total, limitPerPhone: l.limit_per_phone, budget: l.budget === null ? null : Number(l.budget) }, used.get(l.id),
    uses.filter((u) => u.discountId === l.id).reduce((a, u) => a + u.amount, 0)))
  return bad ? uses.find((u) => u.discountId === bad.id)!.title : null
}

/** Save an items edit. `soldOut` / `backInStock` gather the variants to refresh on the shop after the commit. */
export async function editItems(tx: Tx, tenantId: string, actor: Actor, orderId: string, input: EditInput, now = new Date()): Promise<Edited> {
  if (actor.kind === 'support') return { ok: false, error: SUPPORT }
  const c = await current(tx, tenantId, orderId, now)
  if (!c) return { ok: false, error: 'Order not found.' }
  const why = notEditable(c.state, c.o)
  if (why) return { ok: false, error: why }
  try {
    return await tx.transaction(async (sp) => {
      const named = input.want.flatMap((w) => (w.variantId ? [w.variantId] : []))
      await lockVariants(sp, tenantId, [...await editVariantIds(sp, tenantId, orderId), ...named])
      const read = await editFactsIn(sp, tenantId, orderId, now, named)
      if (!read) throw new Refused('Order not found.')
      const { facts, live, rows } = read
      const r = planEdit(facts, inOrder(live, input.want), input.reasons)
      if (!r.ok) throw new Refused(problemWords(r.problem, inr))
      const p = r.plan
      if (p.total.after !== input.expectedTotal) throw new Refused(`The new total is ${inr(p.total.after)}. Check it, then save again.`, p.total.after)
      // A saving that grew is a bigger use of its offer: it must still fit its budget.
      const grew = p.offers.flatMap((x) => { const o = facts.offers!.find((k) => k.rowId === x.rowId)!.kept
        return x.after > x.before && usesOnCod({ class: classOf(o.terms.style), method: o.method }) ? [{ discountId: o.terms.id, amount: x.after, title: x.title }] : [] })
      const short = await stillFit(sp, tenantId, orderId, grew, now)
      if (short) throw new Refused(`${short} has no room for a bigger saving. Keep the order as it was.`)

      const stamp = moment(now)
      const byId = new Map(live.map((l) => [l.id, l]))
      const out = [...p.removed.map((x) => x.line.id), ...p.lines.filter((l) => l.from && l.change !== 'kept').map((l) => l.from!.id)]
      const backInStock = await putStockBackLines(sp, tenantId, out)
      if (out.length) await sp.update(orderLines).set({ removedAt: stamp }).where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.orderId, orderId), inArray(orderLines.id, out)))
      // The new lines: a changed quantity is the line as sold, again; a swap or an addition is sold as checkout sells it now.
      const costs = await unitCosts(sp, tenantId, p.lines.filter((l) => l.change === 'swap' || l.change === 'added').map((l) => l.variantId!))
      let next = Math.max(-1, ...live.map((l) => l.position)) + 1
      const fresh = p.lines.flatMap((l, i) => {
        if (l.change === 'kept') return []
        const priced = p.price.lines[i]!, share = { chargeTaxable: priced.chargeTaxable, chargeGst: priced.chargeGst }
        const position = l.from ? byId.get(l.from.id)!.position : next++
        if (l.change === 'qty') {
          const old = byId.get(l.from!.id)!
          const kind = l.qty < old.qty ? old.kind : (sellsAs(rows.find((x) => x.variantId === old.variantId)!, live, l.qty, now).kind)
          const { id: _i, removedAt: _r, replacedBy: _b, stockTakenAt: _s, ...as } = old
          return [{ i, row: { ...as, qty: l.qty, kind, position, lineDiscount: priced.discount, productDiscount: priced.productDiscount, taxableValue: priced.taxable, gstBps: priced.gstBps, gst: priced.gst, ...share } }]
        }
        const v = rows.find((x) => x.variantId === l.variantId)!
        const sold = sellsAs(v, live, l.qty, now)
        const q: QuoteLine = { variantId: v.variantId, productId: v.productId, handle: v.handle, title: v.title, options: v.options, values: v.values, sku: v.sku, image: v.image, unitPrice: v.price,
          compareAt: v.compareAt, requested: l.qty, qty: l.qty, kind: sold.kind, shipsBy: sold.kind === 'preorder' ? v.shipsBy : null, leadMinDays: sold.kind === 'made_to_order' ? v.leadMinDays : null,
          leadMaxDays: sold.kind === 'made_to_order' ? v.leadMaxDays : null, gross: v.price * l.qty, hsn: v.hsn, uqc: v.uqc ?? 'NOS', problem: null }
        return [{ i, row: lineSnapshot(q, priced, share, { tenantId, orderId, position, unitCost: costs.get(v.variantId) ?? null }) }]
      })
      const inserted = fresh.length ? await sp.insert(orderLines).values(fresh.map((x) => x.row)).returning({ id: orderLines.id }) : []
      const idAt = new Map(fresh.map((x, k) => [x.i, inserted[k]!.id]))
      for (const l of p.lines) if (l.from && l.change !== 'kept') {
        await sp.update(orderLines).set({ replacedBy: idAt.get(p.lines.indexOf(l))! }).where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.id, l.from.id)))
      }
      const soldOut: string[] = []
      const take = fresh.filter((x) => x.row.kind === 'in_stock').map((x) => idAt.get(x.i)!)
      if ((await takeStockLines(sp, tenantId, take, soldOut)).short) throw new Refused('A piece sold out while you were editing. Reload the order.')

      const lineIds = p.lines.map((l, i) => (l.change === 'kept' ? l.from!.id : idAt.get(i)!))
      const unitCost = (i: number) => { const l = p.lines[i]!; return l.change === 'kept' || l.change === 'qty' ? byId.get(l.from!.id)!.unitCost : fresh.find((x) => x.i === i)!.row.unitCost ?? null }
      const cogs = p.lines.every((_, i) => unitCost(i) != null) ? p.lines.reduce((a, l, i) => a + Number(unitCost(i)) * l.qty, 0) : null
      await writeReprice(sp, tenantId, orderId, lineIds, { ...p.price, codCharge: facts.order.codCharge }, { subtotal: p.subtotal, shipping: p.shipping.after, cogs })

      // Offers: one whose amount moved comes off; a new row (the same terms) carries what it gives now.
      const moved = p.offers.map((x) => x.rowId)
      if (moved.length) await sp.update(orderDiscounts).set({ removedAt: stamp }).where(and(eq(orderDiscounts.tenantId, tenantId), eq(orderDiscounts.orderId, orderId), inArray(orderDiscounts.id, moved)))
      const again = p.offers.filter((x) => x.after > 0)
      const copies = again.length ? await sp.select().from(orderDiscounts).where(and(eq(orderDiscounts.tenantId, tenantId), inArray(orderDiscounts.id, again.map((x) => x.rowId)))) : []
      const added = copies.length ? await sp.insert(orderDiscounts).values(copies.map(({ id, removedAt: _r, ...row }) => ({ ...row, amount: again.find((x) => x.rowId === id)!.after })))
        .returning({ id: orderDiscounts.id }) : []

      const eventId = await record(sp, tenantId, orderId, actor, 'items_edited', stamp)
      const [edit] = await sp.insert(orderEdits).values({ tenantId, orderId, eventId, totalBefore: p.total.before, totalAfter: p.total.after, shippingBefore: p.shipping.before,
        shippingAfter: p.shipping.after, notify: input.notify, offersRemoved: moved, offersAdded: added.map((a) => a.id) }).returning({ id: orderEdits.id })
      const reasonOf = new Map(p.removed.map((x) => [x.line.id, x.reason]))
      await sp.insert(orderEditLines).values([
        ...live.map((l) => ({ tenantId, editId: edit!.id, side: 'before', orderLineId: l.id, variantId: l.variantId, qty: l.qty, unitPrice: l.unitPrice, productDiscount: l.productDiscount, lineDiscount: l.lineDiscount, reason: reasonOf.get(l.id) ?? null })),
        ...p.lines.map((l, i) => ({ tenantId, editId: edit!.id, side: 'after', orderLineId: lineIds[i]!, variantId: l.variantId, qty: l.qty, unitPrice: l.unitPrice,
          productDiscount: p.price.lines[i]!.productDiscount, lineDiscount: p.price.lines[i]!.discount, replaces: l.change === 'kept' || !l.from ? null : l.from.id })),
      ])
      if (input.notify) await enqueueOrderEmail(sp, tenantId, orderId, 'edited', eventId, now)
      return { ok: true as const, eventId, total: p.total.after, soldOut, backInStock }
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
    removed: orderEdits.offersRemoved, added: orderEdits.offersAdded }).from(orderEdits)
    .innerJoin(orderEvents, and(eq(orderEvents.tenantId, orderEdits.tenantId), eq(orderEvents.id, orderEdits.eventId)))
    .where(and(eq(orderEdits.tenantId, tenantId), eq(orderEdits.eventId, eventId)))
  if (!e) return { ok: false, error: 'There is nothing to undo.' }
  const c = await current(tx, tenantId, e.orderId, now)
  if (!c) return { ok: false, error: 'Order not found.' }
  const [already] = await tx.select({ id: orderEvents.id }).from(orderEvents).where(and(eq(orderEvents.tenantId, tenantId), eq(orderEvents.undoes, eventId)))
  if (already) return { ok: false, error: 'Already undone.' }
  const why = notEditable(c.state, c.o)
  if (why) return { ok: false, error: why }
  if (now > undoUntil(e.at)) return { ok: false, error: 'The 10 minutes to undo have passed. Edit the items instead.' }
  try {
    return await tx.transaction(async (sp) => {
      const sides = await sp.select().from(orderEditLines).where(and(eq(orderEditLines.tenantId, tenantId), eq(orderEditLines.editId, e.id)))
      const before = sides.filter((s) => s.side === 'before'), after = sides.filter((s) => s.side === 'after')
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
      if (goes.length) await sp.update(orderLines).set({ removedAt: stamp }).where(and(eq(orderLines.tenantId, tenantId), inArray(orderLines.id, goes)))
      if (comes.length) await sp.update(orderLines).set({ removedAt: null, replacedBy: null }).where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.orderId, e.orderId), inArray(orderLines.id, comes)))
      const restored = await sp.select().from(orderLines).where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.orderId, e.orderId), isNull(orderLines.removedAt)))
      const soldOut: string[] = []
      const take = restored.filter((l) => comes.includes(l.id) && l.kind === 'in_stock').map((l) => l.id)
      if ((await takeStockLines(sp, tenantId, take, soldOut)).short) throw new Refused('A piece it had sold out since: Undo can\'t put it back. Edit the items instead.')

      if (e.added.length) await sp.update(orderDiscounts).set({ removedAt: stamp }).where(and(eq(orderDiscounts.tenantId, tenantId), inArray(orderDiscounts.id, e.added)))
      if (e.removed.length) await sp.update(orderDiscounts).set({ removedAt: null }).where(and(eq(orderDiscounts.tenantId, tenantId), eq(orderDiscounts.orderId, e.orderId), inArray(orderDiscounts.id, e.removed)))
      const offers = await sp.select().from(orderDiscounts).where(and(eq(orderDiscounts.tenantId, tenantId), eq(orderDiscounts.orderId, e.orderId), isNull(orderDiscounts.removedAt)))
      const back = offers.filter((o) => e.removed.includes(o.id) && usesOnCod(o)).map((o) => ({ discountId: o.discountId, amount: Number(o.amount), title: o.title }))
      const gone = await stillFit(sp, tenantId, e.orderId, back, now)
      if (gone) throw new Refused(`${gone} ran out since: Undo would give it again. Edit the items instead.`)

      // The lines as they were (the before rows' product discounts), in position order, priced as they had been.
      const lines = [...restored].sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1))
      const pd = new Map(before.map((b) => [b.orderLineId, Number(b.productDiscount)]))
      const [o] = await sp.select({ codCharge: orders.codCharge, pricesIncludeGst: orders.pricesIncludeGst, placedAt: orders.placedAt, sellerGstin: orders.sellerGstin, sellerScheme: orders.sellerScheme })
        .from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.id, e.orderId)))
      const price = priceAsKept(lines.map((l) => ({ unitPrice: Number(l.unitPrice), qty: l.qty, hsn: l.hsn, gstBps: l.gstBps, productDiscount: pd.get(l.id) ?? 0 })),
        offers.map((x) => ({ class: x.class, method: x.method, amount: Number(x.amount) })), { shipping: Number(e.shippingBefore), codCharge: Number(o!.codCharge) },
        { registered: chargesGst({ gstin: o!.sellerGstin, scheme: (o!.sellerScheme ?? 'regular') as Scheme }), pricesIncludeGst: o!.pricesIncludeGst, placedAt: o!.placedAt })
      if (price.total !== Number(e.totalBefore)) console.error('[undoEdit] the total put back differs from the one before the edit', { order: e.orderId })
      const cogs = lines.every((l) => l.unitCost !== null) ? lines.reduce((a, l: LiveLine) => a + Number(l.unitCost) * l.qty, 0) : null
      await writeReprice(sp, tenantId, e.orderId, lines.map((l) => l.id), { ...price, codCharge: Number(o!.codCharge) },
        { subtotal: lines.reduce((a, l) => a + Number(l.unitPrice) * l.qty, 0), shipping: Number(e.shippingBefore), cogs })
      const undone = await record(sp, tenantId, e.orderId, actor, 'undone', stamp, { undoes: eventId, reason: 'items_edited' })
      return { ok: true as const, eventId: undone, total: price.total, soldOut, backInStock }
    })
  } catch (err) {
    if (err instanceof Refused) return { ok: false, error: err.words }
    throw err
  }
}
