import 'server-only'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { arrivalRange, type LineKind, type QuoteLine } from '@/domains/checkout/quote'
import { inOrder, planEdit, problemWords, type EditFacts, type EditPlan, type EditReason, type Want } from '@/domains/orders/edit'
import type { Paise } from '@/domains/money/paise'
import { formatInr } from '@/lib/format'
import type { Tx } from '@/lib/db'
import { discountUses, fits } from '@/lib/db/discount-predicates'
import { shopSettings } from '@/lib/db/schema'
import { discounts, orderDiscounts } from '@/lib/db/schema-discounts'
import { orderLines, orders } from '@/lib/db/schema-orders'
import { editFactsIn, editVariantIds, sellsAs, type EditRead } from './edit-facts'
import { lineSnapshot, unitCosts } from './lines'
import { writeReprice } from './reprice'
import { lockVariants, putStockBackLines, takeStockLines } from './stock'
import { moment } from './work'

// =============================================================================
// FILE: src/lib/orders/edit-write.ts
//
// AN ITEMS EDIT'S PLAN AND ITS WRITE, shared by the save (orders/edit.ts: applied at once) and a paid change (orders/
// edit-capture.ts: applied when the shopper's payment for it is captured). Inside the caller's savepoint, under the
// order's lock. Every touched variant is locked first, then the facts are read and the plan made again
// (domains/orders/edit.ts). The write: the pieces coming out go back, lines taken out (removed_at, replaced_by) and their
// successors inserted (lineSnapshot), the new pieces taken, every money column written together (writeReprice), the
// arrival dates made again, and an offer whose amount moved taken off with a new row for what it gives now. A refusal
// throws Refused, and the caller's savepoint rolls it all back.
// =============================================================================

export class Refused extends Error { constructor(readonly words: string, readonly total?: number) { super('refused') } }
export const inr = (p: number) => formatInr(p as Paise)

/** The arrival promise again, from the live lines (a piece pre-ordered or made to order moves it), as placement makes it. */
export async function rearrive(tx: Tx, tenantId: string, orderId: string, now: Date) {
  const [s] = await tx.select({ dispatchDays: shopSettings.dispatchDays, metroDays: shopSettings.metroDays, restDays: shopSettings.restDays }).from(shopSettings).where(eq(shopSettings.tenantId, tenantId))
  const ls = await tx.select({ kind: orderLines.kind, shipsBy: orderLines.shipsBy, leadMinDays: orderLines.leadMinDays, leadMaxDays: orderLines.leadMaxDays }).from(orderLines)
    .where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.orderId, orderId), isNull(orderLines.removedAt)))
  const r = s ? arrivalRange(ls.map((l) => ({ ...l, kind: l.kind as LineKind })), s, now) : null
  if (r) await tx.update(orders).set({ arrivesFrom: r.from, arrivesTo: r.to }).where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId)))
}

/** The limited offers among `uses` whose new use must fit (limits and budgets), the order's own use left out. */
export async function stillFit(tx: Tx, tenantId: string, orderId: string, uses: { discountId: string; amount: number; title: string }[], now: Date): Promise<string | null> {
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

/**
 * The plan for this request from facts read after every touched variant is locked. `adjust` lets a paid change plan
 * with the prices it was saved at and its own held pieces back (edit-capture.ts). Refused when it can't be made.
 */
export async function planLocked(sp: Tx, tenantId: string, orderId: string, want: Want[], reasons: Record<string, EditReason | undefined>, now: Date,
  adjust?: (f: EditFacts) => EditFacts): Promise<{ read: EditRead; p: EditPlan }> {
  const named = want.flatMap((w) => (w.variantId ? [w.variantId] : []))
  await lockVariants(sp, tenantId, [...await editVariantIds(sp, tenantId, orderId), ...named])
  const read = await editFactsIn(sp, tenantId, orderId, now, named)
  if (!read) throw new Refused('Order not found.')
  const facts = adjust ? adjust(read.facts) : read.facts
  const r = planEdit(facts, inOrder(read.live, want), reasons)
  if (!r.ok) throw new Refused(problemWords(r.problem, inr))
  return { read: { ...read, facts }, p: r.plan }
}

export type Written = { lineIds: string[]; moved: string[]; added: string[]; soldOut: string[]; backInStock: string[]; newLines: { variantId: string | null; id: string }[] }

/** Write the plan onto the order: lines, stock, money, arrival, offers. */
export async function applyPlan(sp: Tx, tenantId: string, orderId: string, p: EditPlan, read: EditRead, now: Date): Promise<Written> {
  const { facts, live, rows } = read
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
      // Fewer pieces sell as they did; more sell as checkout would sell them now, with that kind's own dates.
      const v = l.qty < old.qty ? null : rows.find((x) => x.variantId === old.variantId)!
      const kind = v ? sellsAs(v, live, l.qty, now).kind : old.kind
      const dates = v ? { shipsBy: kind === 'preorder' ? v.shipsBy : null, leadMinDays: kind === 'made_to_order' ? v.leadMinDays : null, leadMaxDays: kind === 'made_to_order' ? v.leadMaxDays : null } : {}
      const { id: _i, removedAt: _r, replacedBy: _b, stockTakenAt: _s, ...as } = old
      return [{ i, row: { ...as, ...dates, qty: l.qty, kind, position, lineDiscount: priced.discount, productDiscount: priced.productDiscount, taxableValue: priced.taxable, gstBps: priced.gstBps, gst: priced.gst, ...share } }]
    }
    const v = rows.find((x) => x.variantId === l.variantId)!
    const sold = sellsAs(v, live, l.qty, now)
    const q: QuoteLine = { variantId: v.variantId, productId: v.productId, handle: v.handle, title: v.title, options: v.options, values: v.values, sku: v.sku, image: v.image, unitPrice: l.unitPrice,
      compareAt: v.compareAt, requested: l.qty, qty: l.qty, kind: sold.kind, shipsBy: sold.kind === 'preorder' ? v.shipsBy : null, leadMinDays: sold.kind === 'made_to_order' ? v.leadMinDays : null,
      leadMaxDays: sold.kind === 'made_to_order' ? v.leadMaxDays : null, gross: l.unitPrice * l.qty, hsn: v.hsn, uqc: v.uqc ?? 'NOS', problem: null }
    return [{ i, row: lineSnapshot(q, priced, share, { tenantId, orderId, position, unitCost: costs.get(v.variantId) ?? null }) }]
  })
  const inserted = fresh.length ? await sp.insert(orderLines).values(fresh.map((x) => x.row)).returning({ id: orderLines.id }) : []
  const idAt = new Map(fresh.map((x, k) => [x.i, inserted[k]!.id]))
  for (const l of p.lines) if (l.from && l.change !== 'kept') {
    await sp.update(orderLines).set({ replacedBy: idAt.get(p.lines.indexOf(l))! }).where(and(eq(orderLines.tenantId, tenantId), eq(orderLines.orderId, orderId), eq(orderLines.id, l.from.id)))
  }
  const soldOut: string[] = []
  const take = fresh.filter((x) => x.row.kind === 'in_stock').map((x) => idAt.get(x.i)!)
  if ((await takeStockLines(sp, tenantId, take, soldOut)).short) throw new Refused('A piece sold out while you were editing. Reload the order.')

  const lineIds = p.lines.map((l, i) => (l.change === 'kept' ? l.from!.id : idAt.get(i)!))
  const unitCost = (i: number) => { const l = p.lines[i]!; return l.change === 'kept' || l.change === 'qty' ? byId.get(l.from!.id)!.unitCost : fresh.find((x) => x.i === i)!.row.unitCost ?? null }
  const cogs = p.lines.every((_, i) => unitCost(i) != null) ? p.lines.reduce((a, l, i) => a + Number(unitCost(i)) * l.qty, 0) : null
  // Paid online, the order carries no COD fee: the plan priced it so (domains/orders/edit.ts `way`).
  await writeReprice(sp, tenantId, orderId, lineIds, { ...p.price, codCharge: facts.order.way === 'cod' ? facts.order.codCharge : 0 }, { subtotal: p.subtotal, shipping: p.shipping.after, cogs })
  await rearrive(sp, tenantId, orderId, now)

  // Offers: one whose amount moved comes off; a new row (the same terms) carries what it gives now.
  const moved = p.offers.map((x) => x.rowId)
  if (moved.length) await sp.update(orderDiscounts).set({ removedAt: stamp }).where(and(eq(orderDiscounts.tenantId, tenantId), eq(orderDiscounts.orderId, orderId), inArray(orderDiscounts.id, moved)))
  const again = p.offers.filter((x) => x.after > 0)
  const copies = again.length ? await sp.select().from(orderDiscounts).where(and(eq(orderDiscounts.tenantId, tenantId), inArray(orderDiscounts.id, again.map((x) => x.rowId)))) : []
  const added = copies.length ? await sp.insert(orderDiscounts).values(copies.map(({ id, removedAt: _r, ...row }) => ({ ...row, amount: again.find((x) => x.rowId === id)!.after })))
    .returning({ id: orderDiscounts.id }) : []
  return { lineIds, moved, added: added.map((a) => a.id), soldOut, backInStock, newLines: fresh.map((x) => ({ variantId: x.row.variantId ?? null, id: idAt.get(x.i)! })) }
}
