// =============================================================================
// FILE: src/domains/orders/edit.ts
//
// EDITING A PLACED ORDER'S ITEMS (spec docs/specs/2026-11-11-order-edit.md; plan docs/plans/2026-11-12-order-edit.md,
// OE·1: pay on delivery and unpaid). "These lines now" → the order priced again, one way, everywhere: the order page's
// panel runs this in the browser as the merchant taps, and the save runs it again on the server under the order's lock
// (src/lib/orders/edit.ts) and refuses a total that moved. Pure; paise; bps; no clock.
//
// The rules:
// - A line keeps the price it was sold at (a new quantity too); a swapped or added line is at today's price. A swap
//   stays within the line's product. A line whose product was deleted can only stay or come out.
// - At most one line a variant, 1–10 pieces, at most 20 lines, at least one (none left is a cancel).
// - A new piece needs room: what can be sold of its variant now with the order's own pieces back (`room`); fewer
//   pieces of the same variant need none.
// - Offers are the order's own, re-planned on the new lines from the terms it kept (replanKept): never a new one. One
//   that gives nothing comes off; one that gives another amount is a new use of it.
// - Delivery is the order's own charge, unless the bag crosses the shop's own free-delivery threshold (today's
//   `freeShippingAbove`): below it a bag that went free pays today's flat charge, at it a bag that paid goes free, as
//   checkout would charge it. Free delivery from an offer waives that charge while the bag reaches its minimum.
// - Paying on delivery: the order's own COD fee; the new total is what the courier collects. Today's COD maximum
//   refuses a higher total above it (with the limit), never the minimum.
// =============================================================================

import { classOf, priceMethod, type MethodPrice, type PlanLine } from '@/domains/checkout/discounts'
import { MAX_LINES, MAX_QTY } from '@/domains/checkout/quote'
import { replanKept, type Kept } from '@/domains/checkout/replan'
import { currentMethod, type OrderMoments, type OrderState } from './order-state'
import { applies } from './work'

export const EDIT_REASONS = ['out_of_stock', 'customer_asked', 'other'] as const
export type EditReason = (typeof EDIT_REASONS)[number]
export const REASON_LABEL: Record<EditReason, string> = { out_of_stock: 'Out of stock', customer_asked: 'Customer asked', other: 'Other' }

/**
 * Why this order's items can't change now (null: they can), roles aside: the one rule for the order page's button and
 * the save. Until packed (applies('edit')); never paid online, nor an order that started as an online payment and was
 * switched to pay on delivery — its Razorpay order can still be paid at the old total (security review 2026-11-12):
 * both wait for online-paid editing (OE·2).
 */
export function cannotEdit(state: OrderState, o: Pick<OrderMoments, 'paidAt' | 'paymentMethod' | 'switchedToCodAt'> & { razorpayOrderId: string | null }): string | null {
  if (!applies('edit', state)) return state === 'packed' || state === 'shipped' ? 'Already packed: its slip and invoice keep these items.' : `This order is ${state.replace('_', ' ')}.`
  if (o.paidAt || currentMethod(o) !== 'cod') return 'Paid online: its items can\'t be changed here yet.'
  if (o.switchedToCodAt && o.razorpayOrderId) return 'This order started as an online payment. Its items can be changed once online-paid editing arrives.'
  return null
}

/** How long an edit can be undone (owner, 2026-11-12); packing ends it sooner. Its email waits as long. */
export const UNDO_MINUTES = 10
export const undoUntil = (at: Date) => new Date(at.getTime() + UNDO_MINUTES * 60_000)

/** A live line as sold. */
export type SoldLine = {
  id: string; variantId: string | null; productId: string | null; title: string; values: string[]
  qty: number; unitPrice: number; hsn: string | null; gstBps: number; productDiscount: number
  /** Its pieces left the shelf (they go back when it comes out). */
  stockTaken: boolean
}
/** A variant the edit may put on the order, as it is sold today. */
export type Choice = { variantId: string; productId: string; title: string; values: string[]; price: number; hsn: string | null; ownBps: number | null }
/** The order line a wanted line continues (null: added), the variant and how many. */
export type Want = { line: string | null; variantId: string | null; qty: number }
/** An offer the order kept: its order_discounts row and its terms. */
export type KeptRow = { rowId: string; kept: Kept }

export type EditFacts = {
  /** The live lines, in position order. */
  lines: SoldLine[]
  choices: Choice[]
  /** Null: an offer's terms were not kept (a product offer placed before 0110), so it cannot be re-planned. */
  offers: KeptRow[] | null
  order: { shipping: number; codCharge: number; total: number; pricesIncludeGst: boolean; registered: boolean; placedAt: Date }
  rules: { shippingFlat: number; freeShippingAbove: number; codMax: number }
  /** Pieces of a variant the order may hold on a new or changed line (today's free stock, its own pieces back). */
  room: Record<string, number>
}

export type Change = 'kept' | 'qty' | 'swap' | 'added'
export type PlannedLine = {
  /** The sold line it is or continues (null: added). */
  from: SoldLine | null
  change: Change
  variantId: string | null; productId: string | null; title: string; values: string[]
  qty: number; unitPrice: number; hsn: string | null
  /** The rate kept for a code the table lacks: the sold line's, or the product's own today. */
  own: number | null
}
export type OfferChange = { rowId: string; title: string; before: number; after: number }
export type EditPlan = {
  lines: PlannedLine[]
  removed: { line: SoldLine; reason: EditReason }[]
  /** Every kept offer whose amount moved (0 after: it comes off). */
  offers: OfferChange[]
  /** The offers' amounts after, by row (those that still apply). */
  amounts: { rowId: string; amount: number }[]
  productDisc: number[]
  subtotal: number
  shipping: { before: number; after: number }
  price: MethodPrice
  total: { before: number; after: number }
}
export type EditProblem =
  | { kind: 'nothing' } | { kind: 'empty' } | { kind: 'too_many' } | { kind: 'unknown' } | { kind: 'qty' }
  | { kind: 'twice'; title: string } | { kind: 'other_product'; title: string } | { kind: 'gone'; title: string }
  | { kind: 'no_room'; title: string; values: string[]; left: number } | { kind: 'no_reason'; title: string }
  | { kind: 'offers_unknown' } | { kind: 'cod_max'; max: number }

const cls = (k: Kept) => classOf(k.terms.style)
const onCod = (k: Kept) => cls(k) === 'order' && (k.method === null || k.method === 'cod')

/**
 * The wanted lines in the order's own line order, added lines after (as the save numbers their positions): the browser
 * and the server plan the same list, so a saving spread over the lines rounds the same way.
 */
export function inOrder<T extends { line: string | null }>(lines: { id: string }[], want: T[]): T[] {
  const at = new Map(lines.map((l, i) => [l.id, i]))
  const rank = (w: T) => (w.line === null ? lines.length : at.get(w.line) ?? lines.length)
  return [...want].sort((a, b) => rank(a) - rank(b))
}

/** Whether an order offer row counts as a use while the order pays on delivery (limits and budgets). */
export const usesOnCod = (r: { class: string; method: string | null }) => r.class !== 'payment' && r.method !== 'prepaid'

/**
 * The order with these lines (in `inOrder` order), priced paying on delivery, or why not. `reasons` names why each line that comes out does
 * (every one needs one). An unchanged request is 'nothing'.
 */
export function planEdit(f: EditFacts, want: Want[], reasons: Record<string, EditReason | undefined>): { ok: true; plan: EditPlan } | { ok: false; problem: EditProblem } {
  const fail = (problem: EditProblem) => ({ ok: false as const, problem })
  if (!want.length) return fail({ kind: 'empty' })
  if (want.length > MAX_LINES) return fail({ kind: 'too_many' })
  if (f.offers === null) return fail({ kind: 'offers_unknown' })
  const byId = new Map(f.lines.map((l) => [l.id, l]))
  const choice = new Map(f.choices.map((c) => [c.variantId, c]))
  const seenLine = new Set<string>(), seenVariant = new Set<string>()
  const lines: PlannedLine[] = []
  for (const w of want) {
    if (!Number.isInteger(w.qty) || w.qty < 1 || w.qty > MAX_QTY) return fail({ kind: 'qty' })
    const from = w.line === null ? null : byId.get(w.line)
    if (from === undefined || (w.line !== null && seenLine.has(w.line))) return fail({ kind: 'unknown' })
    if (w.line !== null) seenLine.add(w.line)
    const variantId = w.variantId ?? from?.variantId ?? null
    if (variantId !== null) {
      if (seenVariant.has(variantId)) return fail({ kind: 'twice', title: from?.title ?? choice.get(variantId)?.title ?? '' })
      seenVariant.add(variantId)
    }
    // The same piece: as sold, its quantity may change (a line whose product was deleted only stays as it is).
    if (from && variantId === from.variantId) {
      if (from.variantId === null && w.qty !== from.qty) return fail({ kind: 'gone', title: from.title })
      const change: Change = w.qty === from.qty ? 'kept' : 'qty'
      if (change === 'qty' && w.qty > from.qty && w.qty > (f.room[variantId!] ?? 0)) return fail({ kind: 'no_room', title: from.title, values: from.values, left: f.room[variantId!] ?? 0 })
      lines.push({ from, change, variantId, productId: from.productId, title: from.title, values: from.values, qty: w.qty, unitPrice: from.unitPrice, hsn: from.hsn, own: from.gstBps })
      continue
    }
    const c = variantId === null ? undefined : choice.get(variantId)
    if (!c) return fail({ kind: 'gone', title: from?.title ?? '' })
    if (from && (from.productId === null || from.productId !== c.productId)) return fail({ kind: 'other_product', title: from.title })
    if (w.qty > (f.room[c.variantId] ?? 0)) return fail({ kind: 'no_room', title: c.title, values: c.values, left: f.room[c.variantId] ?? 0 })
    lines.push({ from: from ?? null, change: from ? 'swap' : 'added', variantId: c.variantId, productId: c.productId, title: c.title, values: c.values, qty: w.qty, unitPrice: c.price, hsn: c.hsn, own: c.ownBps })
  }
  const removed: EditPlan['removed'] = []
  for (const l of f.lines) {
    if (seenLine.has(l.id)) continue
    const reason = reasons[l.id]
    if (!reason || !(EDIT_REASONS as readonly string[]).includes(reason)) return fail({ kind: 'no_reason', title: l.title })
    removed.push({ line: l, reason })
  }
  if (!removed.length && lines.every((l) => l.change === 'kept')) return fail({ kind: 'nothing' })

  // Offers, then delivery, then the price paying on delivery.
  const offers = f.offers
  const sold = f.lines.reduce((a, l) => a + l.unitPrice * l.qty - l.productDiscount, 0)
  const oldAfter = sold - offers.filter((o) => onCod(o.kept)).reduce((a, o) => a + o.kept.amount, 0)
  const charged = f.order.shipping + offers.filter((o) => cls(o.kept) === 'shipping').reduce((a, o) => a + o.kept.amount, 0)
  const th = f.rules.freeShippingAbove, flat = f.rules.shippingFlat
  const charge = (after: number) => (th > 0 && flat > 0 && charged === 0 && oldAfter >= th && after < th ? flat
    : th > 0 && charged > 0 && oldAfter < th && after >= th ? 0 : charged)
  const plan: PlanLine[] = lines.map((l) => ({ productId: l.productId, variantId: l.variantId, unitPrice: l.unitPrice, qty: l.qty }))
  const r = replanKept(plan, offers.map((o) => o.kept), f.order.shipping, charge)
  const after = new Map(r.kept.map((k) => [k.terms, k.amount]))
  const amounts = offers.flatMap((o) => (after.has(o.kept.terms) ? [{ rowId: o.rowId, amount: after.get(o.kept.terms)! }] : []))
  const changed = offers.map((o) => ({ rowId: o.rowId, title: o.kept.terms.title, before: o.kept.amount, after: after.get(o.kept.terms) ?? 0 })).filter((x) => x.before !== x.after)
  const orderAmount = r.kept.filter(onCod).reduce((a, k) => a + k.amount, 0)
  const price = priceMethod(lines.map((l, i) => ({ gross: l.unitPrice * l.qty, qty: l.qty, hsn: l.hsn, productDiscount: r.productDisc[i]!, own: l.own })), orderAmount, 0,
    r.shipping + f.order.codCharge, { registered: f.order.registered, pricesIncludeGst: f.order.pricesIncludeGst, date: f.order.placedAt })
  const total = price.total
  if (f.rules.codMax > 0 && total > f.rules.codMax && total > f.order.total) return fail({ kind: 'cod_max', max: f.rules.codMax })
  return { ok: true, plan: {
    lines, removed, offers: changed, amounts, productDisc: r.productDisc, subtotal: plan.reduce((a, l) => a + l.unitPrice * l.qty, 0),
    shipping: { before: f.order.shipping, after: r.shipping }, price, total: { before: f.order.total, after: total },
  } }
}

/**
 * Lines and offers exactly as they stood (an Undo puts an edit's `before` back): each line's stored product discount,
 * the order offer paying on delivery gets, the delivery charge and COD fee as they were — the price they had.
 */
export function priceAsKept(lines: { unitPrice: number; qty: number; hsn: string | null; gstBps: number; productDiscount: number }[], offers: { class: string; method: string | null; amount: number }[],
  charges: { shipping: number; codCharge: number }, o: { registered: boolean; pricesIncludeGst: boolean; placedAt: Date }): MethodPrice {
  const order = offers.filter((x) => x.class === 'order' && (x.method === null || x.method === 'cod')).reduce((a, x) => a + x.amount, 0)
  return priceMethod(lines.map((l) => ({ gross: l.unitPrice * l.qty, qty: l.qty, hsn: l.hsn, productDiscount: l.productDiscount, own: l.gstBps })), order, 0,
    charges.shipping + charges.codCharge, { registered: o.registered, pricesIncludeGst: o.pricesIncludeGst, date: o.placedAt })
}

/** The option values that changed between two pieces of one product ("M" → "L"; a colour and a size both, joined). */
export function valuesChanged(before: string[], after: string[]): { from: string; to: string } {
  const at = after.map((_, i) => i).filter((i) => before[i] !== after[i])
  const pick = (xs: string[]) => at.map((i) => xs[i]).filter(Boolean).join(' · ')
  return { from: pick(before) || before.join(' · '), to: pick(after) || after.join(' · ') }
}

/** One line's change: what "What changes" lists before Save and Activity records after. */
export type ItemChange = { title: string } & (
  | { kind: 'swap'; from: string[]; to: string[]; qty: [number, number] }
  | { kind: 'qty'; qty: [number, number] }
  | { kind: 'added'; values: string[]; qty: number }
  | { kind: 'removed'; back: boolean })

/** The changes a plan makes, lines in order, then those that come out. */
export function changesOf(p: Pick<EditPlan, 'lines' | 'removed'>): ItemChange[] {
  const out: ItemChange[] = []
  for (const l of p.lines) {
    if (l.change === 'swap' && l.from) out.push({ kind: 'swap', title: l.title, from: l.from.values, to: l.values, qty: [l.from.qty, l.qty] })
    if (l.change === 'qty' && l.from) out.push({ kind: 'qty', title: l.title, qty: [l.from.qty, l.qty] })
    if (l.change === 'added') out.push({ kind: 'added', title: l.title, values: l.values, qty: l.qty })
  }
  for (const r of p.removed) out.push({ kind: 'removed', title: r.line.title, back: r.line.stockTaken })
  return out
}

/** A saved edit's changes, from its record: each `after` line (with the line it replaced) and each `before` line gone. */
export type RecordLine = { lineId: string; title: string; values: string[]; qty: number; replaces: string | null }
export function recordChanges(before: RecordLine[], after: RecordLine[]): ItemChange[] {
  const out: ItemChange[] = []
  const was = new Map(before.map((b) => [b.lineId, b]))
  for (const a of after) {
    if (was.has(a.lineId)) continue
    const b = a.replaces ? was.get(a.replaces) : undefined
    if (!b) out.push({ kind: 'added', title: a.title, values: a.values, qty: a.qty })
    else if (b.values.join('\u0000') !== a.values.join('\u0000')) out.push({ kind: 'swap', title: a.title, from: b.values, to: a.values, qty: [b.qty, a.qty] })
    else out.push({ kind: 'qty', title: a.title, qty: [b.qty, a.qty] })
  }
  const kept = new Set([...after.map((a) => a.lineId), ...after.flatMap((a) => (a.replaces ? [a.replaces] : []))])
  for (const b of before) if (!kept.has(b.lineId)) out.push({ kind: 'removed', title: b.title, back: false })
  return out
}

/** A change as "What changes" says it beside its line's title ("M → L", "Removed · back in stock"). */
export function changeWords(c: ItemChange): string {
  if (c.kind === 'swap') { const v = valuesChanged(c.from, c.to); return `${v.from} → ${v.to}${c.qty[0] !== c.qty[1] ? ` · ${c.qty[0]} → ${c.qty[1]}` : ''}` }
  if (c.kind === 'qty') return `${c.qty[0]} → ${c.qty[1]}`
  if (c.kind === 'added') return ['Added', ...c.values, ...(c.qty > 1 ? [String(c.qty)] : [])].join(' · ')
  return c.back ? 'Removed · back in stock' : 'Removed'
}

/**
 * Activity's line for a saved edit ("Anarkali kurta set M → L, Chanderi dupatta removed · ₹6,016 → ₹5,207 · emailed"):
 * `email` 'sent' once it went, 'waiting' while it is held for the Undo window or queued, null when none goes.
 */
export function activityWords(changes: ItemChange[], total: { before: number; after: number }, email: 'sent' | 'waiting' | null, inr: (paise: number) => string): string {
  const each = changes.map((c) => (c.kind === 'removed' ? `${c.title} removed` : c.kind === 'added' ? `${[c.title, ...c.values].join(' · ')} added` : `${c.title} ${changeWords(c)}`))
  return ['Items changed', each.join(', '), `${inr(total.before)} → ${inr(total.after)}`, ...(email === 'sent' ? ['emailed'] : email === 'waiting' ? ['email waiting'] : [])].filter(Boolean).join(' · ')
}

/** A refusal in the merchant's words. */
export function problemWords(p: EditProblem, inr: (paise: number) => string): string {
  switch (p.kind) {
    case 'nothing': return 'Nothing changed.'
    case 'empty': return 'An order keeps at least one item. To drop them all, cancel it.'
    case 'too_many': return `An order holds up to ${MAX_LINES} items.`
    case 'unknown': return 'This order changed. Reload the page.'
    case 'qty': return `Choose 1 to ${MAX_QTY} of each.`
    case 'twice': return `${p.title} is on the order twice: change its quantity instead.`
    case 'other_product': return `${p.title}: swap within the same product, or remove it and add the other.`
    case 'gone': return `${p.title} is no longer sold: remove it.`
    case 'no_room': return p.left > 0 ? `${[p.title, ...p.values].join(' · ')}: only ${p.left} left.` : `${[p.title, ...p.values].join(' · ')} is sold out.`
    case 'no_reason': return `Say why ${p.title} comes out.`
    case 'offers_unknown': return 'This order was placed before offers could be worked out again. Cancel it and place it again to change its items.'
    case 'cod_max': return `Pay on delivery is for orders up to ${inr(p.max)}. Ask them to pay online, or keep the order as it was.`
  }
}
