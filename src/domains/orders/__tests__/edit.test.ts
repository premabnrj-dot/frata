import { describe, expect, it } from 'vitest'
import type { DiscountTerms } from '@/domains/checkout/discounts'
import { storedTerms, termsCopy } from '@/domains/checkout/kept-terms'
import { keptOffers, quote, type BagLine, type ShopRules, type VariantRow } from '@/domains/checkout/quote'
import { activityWords, changesOf, changeWords, planEdit, priceAsKept, problemWords, recordChanges, valuesChanged, type EditFacts, type SoldLine, type Want } from '../edit'

// The order edit's pure planning (OE·1, docs/plans/2026-11-12-order-edit.md): an order placed by the real quote(), its
// lines and offers as the order stores them, then edited. The planner prices paying on delivery exactly as checkout's
// COD card would for the same lines and the order's own offers, keeps sold prices, and refuses in words.

const now = new Date('2026-11-12T10:00:00+05:30')
const rules: ShopRules = { shippingFlat: 7900, freeShippingAbove: 0, codOn: true, codMin: 0, codMax: 0, codCharge: 4900, pricesIncludeGst: true, registered: true, dispatchDays: 2, metroDays: 2, restDays: 5 }
const v = (id: string, product: string, price: number, values: string[]): VariantRow => ({
  variantId: id, productId: product, handle: 'h' + product, title: 'T' + product, status: 'active', publishAt: null, options: ['Size'], values, sku: null, price, compareAt: null,
  stock: 10, whenOut: 'stop', shipsBy: null, leadMinDays: null, leadMaxDays: null, preorderCap: null, held: 0, preordered: 0, owed: 0, hsn: '6211', image: null,
})
const rows = [v('am', 'pa', 249900, ['M']), v('al', 'pa', 249900, ['L']), v('ax', 'pa', 269900, ['XL']), v('dh', 'pd', 89900, ['Haldi']), v('lm', 'pl', 319900, ['M'])]
const t = (over: Partial<DiscountTerms>): DiscountTerms => ({
  id: 'd1', title: 'Offer', style: 'order_off', percentBps: null, amountOff: null, cap: null, minSubtotal: 0, combinesWithPayment: true, listed: true, code: null, codeId: null, ...over,
})

/** An order placed paying on delivery by the real quote, as the edit reads it back. */
function placed(bag: BagLine[], offers: DiscountTerms[], r: ShopRules = rules): EditFacts {
  const q = quote(bag, rows, r, now, null, { offers })
  const base = q.subtotal - q.cod.lines.reduce((a, l) => a + l.productDiscount, 0)
  const lines: SoldLine[] = q.lines.map((l, i) => ({ id: `line-${l.variantId}`, variantId: l.variantId, productId: l.productId, title: l.title, values: l.values, qty: l.qty, unitPrice: l.unitPrice,
    hsn: l.hsn, gstBps: q.cod.lines[i]!.gstBps, productDiscount: q.cod.lines[i]!.productDiscount, stockTaken: true }))
  return {
    lines, choices: rows.map((x) => ({ variantId: x.variantId, productId: x.productId, title: x.title, values: x.values, price: x.price, hsn: x.hsn, ownBps: null })),
    offers: keptOffers(q, 'cod').map((a) => ({ rowId: `row-${a.discountId}`, kept: { terms: storedTerms({ ...termsCopy(a.terms, base), discountId: a.discountId, title: a.title, style: a.terms.style, codeId: a.codeId })!, method: a.method, amount: a.amount } })),
    order: { shipping: q.shipping, codCharge: q.cod.codCharge, total: q.cod.total, pricesIncludeGst: true, registered: true, placedAt: now },
    rules: { shippingFlat: r.shippingFlat, freeShippingAbove: r.freeShippingAbove, codMax: r.codMax },
    room: Object.fromEntries(rows.map((x) => [x.variantId, 5])),
  }
}
/** What checkout's COD card says for these lines with these offers (the edit must agree when nothing else differs). */
const codTotal = (bag: BagLine[], offers: DiscountTerms[], r: ShopRules = rules) => quote(bag, rows, r, now, null, { offers }).cod.total
const keep = (f: EditFacts): Want[] => f.lines.map((l) => ({ line: l.id, variantId: l.variantId, qty: l.qty }))
const inr = (p: number) => `₹${p / 100}`

const festive = t({ id: 'd-fest', title: 'Festive 10% off', percentBps: 1000 })
const bag = [{ variantId: 'am', qty: 1 }, { variantId: 'dh', qty: 1 }, { variantId: 'lm', qty: 1 }]

describe('planEdit', () => {
  it('swaps a size, removes a line with a reason, and prices as checkout would; the offer steps down as a new amount', () => {
    const f = placed(bag, [festive])
    expect(f.order.total).toBe(codTotal(bag, [festive]))
    const want = [{ line: 'line-am', variantId: 'al', qty: 1 }, { line: 'line-lm', variantId: 'lm', qty: 1 }]
    expect(planEdit(f, want, {})).toEqual({ ok: false, problem: { kind: 'no_reason', title: 'Tpd' } })
    const r = planEdit(f, want, { 'line-dh': 'out_of_stock' })
    if (!r.ok) throw new Error(r.problem.kind)
    expect(r.plan.lines.map((l) => l.change)).toEqual(['swap', 'kept'])
    expect(r.plan.total.after).toBe(codTotal([{ variantId: 'al', qty: 1 }, { variantId: 'lm', qty: 1 }], [festive]))
    expect(r.plan.offers).toEqual([{ rowId: 'row-d-fest', title: 'Festive 10% off', before: 65900, after: 56900 }])
    expect(changesOf(r.plan).map((c) => [c.title, changeWords(c)])).toEqual([['Tpa', 'M → L'], ['Tpd', 'Removed · back in stock']])
    // Activity says the same from the saved record (the line a swap replaced named on its successor).
    const rec = (id: string, title: string, values: string[], replaces: string | null = null) => ({ lineId: id, title, values, qty: 1, replaces })
    const saved = recordChanges([rec('m', 'Tpa', ['M']), rec('d', 'Tpd', ['Haldi']), rec('c', 'Tpl', ['M'])], [rec('l', 'Tpa', ['L'], 'm'), rec('c', 'Tpl', ['M']), rec('x', 'Tpx', ['Red'])])
    expect(activityWords(saved, { before: 601600, after: 520700 }, 'sent', inr)).toBe('Items changed · Tpa M → L, Tpx · Red added, Tpd removed · ₹6016 → ₹5207 · emailed')
    expect(activityWords(saved, { before: 601600, after: 520700 }, 'waiting', inr)).toMatch(/· email waiting$/)
    expect(activityWords(saved, { before: 601600, after: 520700 }, null, inr)).toMatch(/₹5207$/)
  })

  it('keeps the price a line was sold at when only its quantity changes; a swap or an addition is at today\'s price', () => {
    const f = placed([{ variantId: 'am', qty: 1 }], [])
    f.lines[0]!.unitPrice = 199900 // sold before a price rise
    const r = planEdit({ ...f, order: { ...f.order, total: 199900 + 7900 + 4900 } }, [{ line: 'line-am', variantId: 'am', qty: 2 }, { line: null, variantId: 'dh', qty: 1 }], {})
    if (!r.ok) throw new Error(r.problem.kind)
    expect(r.plan.lines.map((l) => [l.change, l.unitPrice, l.qty])).toEqual([['qty', 199900, 2], ['added', 89900, 1]])
    expect(r.plan.subtotal).toBe(2 * 199900 + 89900)
  })

  it('refuses in words: nothing, twice, another product, no room, a deleted product changed, none left, the COD maximum', () => {
    const f = placed(bag, [])
    expect(planEdit(f, keep(f), {})).toEqual({ ok: false, problem: { kind: 'nothing' } })
    expect(planEdit(f, [...keep(f), { line: null, variantId: 'am', qty: 1 }], {}).ok).toBe(false)
    expect(planEdit(f, [{ line: 'line-am', variantId: 'dh', qty: 1 }, { line: 'line-lm', variantId: 'lm', qty: 1 }], { 'line-dh': 'other' }))
      .toEqual({ ok: false, problem: { kind: 'other_product', title: 'Tpa' } })
    const tight = { ...f, room: { ...f.room, al: 1 } }
    const two = planEdit(tight, [{ line: 'line-am', variantId: 'al', qty: 2 }, { line: 'line-dh', variantId: 'dh', qty: 1 }, { line: 'line-lm', variantId: 'lm', qty: 1 }], {})
    expect(two).toEqual({ ok: false, problem: { kind: 'no_room', title: 'Tpa', values: ['L'], left: 1 } })
    expect(problemWords((two as { problem: Parameters<typeof problemWords>[0] }).problem, inr)).toBe('Tpa · L: only 1 left.')
    // Fewer of the same piece needs no room, even sold out.
    const none = { ...f, room: {} }
    expect(planEdit(none, [{ line: 'line-am', variantId: 'am', qty: 1 }, { line: 'line-dh', variantId: 'dh', qty: 1 }, { line: 'line-lm', variantId: 'lm', qty: 1 }].slice(0, 2), { 'line-lm': 'customer_asked' }).ok).toBe(true)
    const deleted = { ...f, lines: f.lines.map((l) => (l.id === 'line-dh' ? { ...l, variantId: null } : l)) }
    expect(planEdit(deleted, [{ line: 'line-am', variantId: 'am', qty: 1 }, { line: 'line-dh', variantId: null, qty: 2 }, { line: 'line-lm', variantId: 'lm', qty: 1 }], {}))
      .toEqual({ ok: false, problem: { kind: 'gone', title: 'Tpd' } })
    expect(planEdit(deleted, [{ line: 'line-am', variantId: 'am', qty: 1 }, { line: 'line-lm', variantId: 'lm', qty: 1 }], { 'line-dh': 'out_of_stock' }).ok).toBe(true)
    expect(planEdit(f, [], {})).toEqual({ ok: false, problem: { kind: 'empty' } })
    // Today's COD maximum refuses a higher total above it; a lower one, even above it, is fine.
    const capped = { ...f, rules: { ...f.rules, codMax: 700000 } }
    expect(planEdit(capped, [...keep(f), { line: null, variantId: 'ax', qty: 1 }], {})).toEqual({ ok: false, problem: { kind: 'cod_max', max: 700000 } })
    expect(problemWords({ kind: 'cod_max', max: 700000 }, inr)).toContain('up to ₹7000')
    const over = { ...f, rules: { ...f.rules, codMax: 100000 } }
    expect(planEdit(over, [{ line: 'line-am', variantId: 'am', qty: 1 }], { 'line-dh': 'other', 'line-lm': 'other' }).ok).toBe(true)
    expect(planEdit({ ...f, offers: null }, keep(f).slice(1), { 'line-am': 'other' })).toEqual({ ok: false, problem: { kind: 'offers_unknown' } })
  })

  it('free delivery from an offer comes off below its minimum and the charge comes back', () => {
    const ship = t({ id: 'd-ship', title: 'Free delivery', style: 'free_shipping', minSubtotal: 500000 })
    const f = placed(bag, [ship])
    expect(f.order.shipping).toBe(0)
    const r = planEdit(f, [{ line: 'line-am', variantId: 'am', qty: 1 }, { line: 'line-dh', variantId: 'dh', qty: 1 }], { 'line-lm': 'customer_asked' })
    if (!r.ok) throw new Error(r.problem.kind)
    expect(r.plan.shipping).toEqual({ before: 0, after: 7900 })
    expect(r.plan.offers).toEqual([{ rowId: 'row-d-ship', title: 'Free delivery', before: 7900, after: 0 }])
    expect(r.plan.total.after).toBe(codTotal([{ variantId: 'am', qty: 1 }, { variantId: 'dh', qty: 1 }], [ship]))
  })

  it('the shop\'s own threshold: below it a free bag pays today\'s charge; at it a paying bag goes free', () => {
    const th = { ...rules, freeShippingAbove: 500000 }
    const f = placed(bag, [], th)
    expect(f.order.shipping).toBe(0)
    const down = planEdit(f, [{ line: 'line-am', variantId: 'am', qty: 1 }, { line: 'line-dh', variantId: 'dh', qty: 1 }], { 'line-lm': 'customer_asked' })
    if (!down.ok) throw new Error(down.problem.kind)
    expect(down.plan.shipping.after).toBe(7900)
    expect(down.plan.total.after).toBe(codTotal([{ variantId: 'am', qty: 1 }, { variantId: 'dh', qty: 1 }], [], th))
    const small = placed([{ variantId: 'am', qty: 1 }], [], th)
    expect(small.order.shipping).toBe(7900)
    const up = planEdit(small, [{ line: 'line-am', variantId: 'am', qty: 1 }, { line: null, variantId: 'lm', qty: 1 }], {})
    if (!up.ok) throw new Error(up.problem.kind)
    expect(up.plan.shipping.after).toBe(0)
    expect(up.plan.total.after).toBe(codTotal([{ variantId: 'am', qty: 1 }, { variantId: 'lm', qty: 1 }], [], th))
    // No threshold crossed: the order's own charge, whatever today's flat charge is.
    const same = planEdit({ ...small, rules: { ...small.rules, shippingFlat: 9900 } }, [{ line: 'line-am', variantId: 'al', qty: 1 }], {})
    if (!same.ok) throw new Error(same.problem.kind)
    expect(same.plan.shipping.after).toBe(7900)
  })

  it('an offer that no longer applies comes off; a step that is no longer reached steps down', () => {
    const steps = t({ id: 'd-steps', title: 'Steps', tiers: [{ min: 300000, percentBps: 500, amountOff: null }, { min: 600000, percentBps: 1000, amountOff: null }] })
    const f = placed(bag, [steps])
    expect(f.offers![0]!.kept.amount).toBe(65900)
    const mid = planEdit(f, [{ line: 'line-am', variantId: 'am', qty: 1 }, { line: 'line-dh', variantId: 'dh', qty: 1 }], { 'line-lm': 'customer_asked' })
    if (!mid.ok) throw new Error(mid.problem.kind)
    expect(mid.plan.offers[0]).toMatchObject({ before: 65900, after: 16900 })
    const off = planEdit(f, [{ line: 'line-dh', variantId: 'dh', qty: 1 }], { 'line-am': 'other', 'line-lm': 'other' })
    if (!off.ok) throw new Error(off.problem.kind)
    expect(off.plan.offers[0]).toMatchObject({ before: 65900, after: 0 })
    expect(off.plan.amounts).toEqual([])
  })

  it('priceAsKept gives an order back the price it had (Undo)', () => {
    const f = placed(bag, [festive])
    const p = priceAsKept(f.lines, f.offers!.map((o) => ({ class: 'order', method: o.kept.method, amount: o.kept.amount })), { shipping: f.order.shipping, codCharge: f.order.codCharge }, f.order)
    expect(p.total).toBe(f.order.total)
  })

  it('names what changed between two pieces', () => {
    expect(valuesChanged(['Rani', 'M'], ['Rani', 'L'])).toEqual({ from: 'M', to: 'L' })
    expect(valuesChanged(['Rani', 'M'], ['Haldi', 'L'])).toEqual({ from: 'Rani · M', to: 'Haldi · L' })
  })
})
