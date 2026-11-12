import { describe, expect, it } from 'vitest'
import { reprice } from '@/domains/orders/amounts'
import { classOf, replanKept, type DiscountTerms, type Kept, type PlanLine } from '../discounts'
import { storedTerms, termsCopy } from '../kept-terms'
import { keptOffers, quote, type BagLine, type Quote, type ShopRules, type VariantRow } from '../quote'

// replanKept (an order edit, docs/plans/2026-11-12-order-edit.md OE·0): the order's OWN offers re-planned on new lines
// from the terms placement copied — never a new offer; one that no longer qualifies comes off; free delivery that no
// longer applies brings its charge back.

const now = new Date('2026-11-12T10:00:00+05:30')
const rules: ShopRules = { shippingFlat: 7900, freeShippingAbove: 0, codOn: true, codMin: 0, codMax: 0, codCharge: 4900, pricesIncludeGst: true, registered: true, dispatchDays: 2, metroDays: 2, restDays: 5 }
const v = (id: string, price: number): VariantRow => ({
  variantId: id, productId: 'p' + id, handle: 'h' + id, title: 'T' + id, status: 'active', publishAt: null, options: [], values: [], sku: null, price, compareAt: null,
  stock: 10, whenOut: 'stop', shipsBy: null, leadMinDays: null, leadMaxDays: null, preorderCap: null, held: 0, preordered: 0, owed: 0, hsn: '6211', image: null,
})
const t = (over: Partial<DiscountTerms>): DiscountTerms => ({
  id: 'd1', title: 'Offer', style: 'order_off', percentBps: null, amountOff: null, cap: null, minSubtotal: 0, combinesWithPayment: true, listed: true, code: null, codeId: null, ...over,
})
const rows = [v('a', 280000), v('b', 90000), v('c', 60000)]
const line = (id: string, qty = 1): PlanLine => { const r = rows.find((x) => x.variantId === id)!; return { productId: r.productId, variantId: id, unitPrice: r.price, qty } }

/** What placement keeps for `method`, written and read back the way an order stores it. */
function kept(q: Quote, method: 'cod' | 'prepaid'): Kept[] {
  const base = q.subtotal - q.cod.lines.reduce((a, l) => a + l.productDiscount, 0)
  return keptOffers(q, method).map((a) => ({ terms: storedTerms({ ...termsCopy(a.terms, base), discountId: a.discountId, title: a.title, style: a.terms.style })!, method: a.method, amount: a.amount }))
}
const placed = (bag: BagLine[], offers: DiscountTerms[], method: 'cod' | 'prepaid' = 'prepaid') => { const q = quote(bag, rows, rules, now, null, { offers }); return { q, kept: kept(q, method) } }
const amounts = (ks: Kept[]) => Object.fromEntries(ks.map((k) => [k.terms.title, k.amount]))
/** The order priced again from a re-plan, as an edit would (reprice: the one repricer). */
const priced = (lines: PlanLine[], r: ReturnType<typeof replanKept>) => {
  const s = { lines: lines.map((l, i) => ({ unitPrice: l.unitPrice, qty: l.qty, hsn: '6211', productDiscount: r.productDisc[i]! })),
    applied: r.kept.map((k) => ({ class: classOf(k.terms.style), amount: k.amount, method: k.method })), shipping: r.shipping, registered: true, pricesIncludeGst: true, placedAt: now }
  return { prepaid: reprice(s, 'prepaid').total, cod: reprice(s, 'cod', rules, null).price!.total }
}

const kurtaOff = t({ id: 'd-kurta', title: 'Kurtas 10%', style: 'product_off', percentBps: 1000, targets: ['pa'] })
const steps = t({ id: 'd-steps', title: 'Steps', tiers: [{ min: 200000, percentBps: 500, amountOff: null }, { min: 350000, percentBps: 1000, amountOff: null }] })
const freeDelivery = t({ id: 'd-ship', title: 'Free delivery', style: 'free_shipping', minSubtotal: 250000 })
const payOnline = t({ id: 'd-online', title: 'Pay online', style: 'pay_online', amountOff: 5000 })

describe('replanKept', () => {
  it('on the lines as placed, gives back exactly what placement kept, and the same totals both ways', () => {
    const bag = [{ variantId: 'a', qty: 1 }, { variantId: 'b', qty: 1 }]
    const { q, kept: k } = placed(bag, [kurtaOff, steps, freeDelivery, payOnline])
    expect(amounts(k)).toEqual({ 'Kurtas 10%': 28000, Steps: 17100, 'Free delivery': 7900, 'Pay online': 5000 }) // ₹3,420 after the kurta offer: the 5% step
    const lines = [line('a'), line('b')]
    const r = replanKept(lines, k, q.shipping)
    expect(r.removed).toEqual([])
    expect(r.kept).toEqual(k)
    expect(r.productDisc).toEqual(q.prepaid.lines.map((l) => l.productDiscount))
    expect(r.shipping).toBe(0)
    expect(priced(lines, r)).toEqual({ prepaid: q.prepaid.total, cod: q.cod.total })
  })

  it('a line taken out: the tier steps down, free delivery below its minimum comes off and its charge comes back', () => {
    const { q, kept: k } = placed([{ variantId: 'a', qty: 1 }, { variantId: 'b', qty: 1 }], [kurtaOff, steps, freeDelivery, payOnline])
    const lines = [line('a')] // ₹2,800 less 10% = ₹2,520: the 5% step (from ₹2,000), not the 10% (from ₹3,500)
    const r = replanKept(lines, k, q.shipping)
    expect(amounts(r.kept)).toEqual({ 'Kurtas 10%': 28000, Steps: 12600, 'Pay online': 5000 })
    expect(r.removed.map((x) => x.terms.title)).toEqual(['Free delivery']) // ₹2,394 after the step: under ₹2,500
    expect(r.shipping).toBe(7900)
    // The same bag placed fresh with the same offers costs the same: the re-plan follows placement's own steps.
    const fresh = quote([{ variantId: 'a', qty: 1 }], rows, rules, now, null, { offers: [kurtaOff, steps, freeDelivery, payOnline] })
    expect(priced(lines, r)).toEqual({ prepaid: fresh.prepaid.total, cod: fresh.cod.total })
  })

  it('below every minimum, each comes off; a scoped product offer covers only its products, added or not', () => {
    const { q, kept: k } = placed([{ variantId: 'a', qty: 1 }, { variantId: 'b', qty: 1 }], [kurtaOff, steps, freeDelivery])
    // The kurta swapped for a dupatta: the kurta offer has nothing to cover; the bag is under every step.
    const r = replanKept([line('b'), line('c')], k, q.shipping)
    expect(r.kept).toEqual([])
    expect(r.removed.map((x) => x.terms.title).sort()).toEqual(['Free delivery', 'Kurtas 10%', 'Steps'])
    expect(r.productDisc).toEqual([0, 0])
    expect(r.shipping).toBe(7900)
    // A second kurta added: the order's own kurta offer covers it too (its terms, not a new offer).
    const two = replanKept([line('a', 2), line('b')], k, q.shipping)
    expect(two.productDisc).toEqual([56000, 0])
  })

  it('never adds an offer: a saving the order did not get stays off when the offer that withheld it comes off', () => {
    const alone = t({ id: 'd-alone', title: 'Festive ₹300', amountOff: 30000, minSubtotal: 300000, combinesWithPayment: false })
    const { q, kept: k } = placed([{ variantId: 'a', qty: 1 }, { variantId: 'b', qty: 1 }], [alone, payOnline])
    expect(k.map((x) => x.terms.title)).toEqual(['Festive ₹300']) // ₹300 beats ₹50 online: the saving is withheld
    const r = replanKept([line('a')], k, q.shipping)
    expect(r.kept).toEqual([])
    expect(r.removed.map((x) => x.terms.title)).toEqual(['Festive ₹300'])
  })

  it('an order kept for each way: each re-planned on its own; free delivery reads the one paying on delivery gets', () => {
    const tenPct = t({ id: 'd-ten', title: '10%', percentBps: 1000, combinesWithPayment: false })
    const hundred = t({ id: 'd-100', title: '₹100', amountOff: 10000, minSubtotal: 300000 })
    const bigSaving = t({ id: 'd-online', title: 'Pay online', style: 'pay_online', amountOff: 40000 })
    const ship = t({ id: 'd-ship', title: 'Free delivery', style: 'free_shipping', minSubtotal: 200000 })
    const { q, kept: k } = placed([{ variantId: 'a', qty: 1 }, { variantId: 'b', qty: 1 }], [tenPct, hundred, bigSaving, ship])
    expect(k.map((x) => [x.terms.title, x.method]).sort()).toEqual([['10%', 'cod'], ['Free delivery', null], ['Pay online', null], ['₹100', 'prepaid']])
    // ₹2,800 left: under ₹100's ₹3,000 (online loses it, keeps the saving); 10% still gives; ₹2,520 still ships free.
    const r = replanKept([line('a')], k, q.shipping)
    expect(amounts(r.kept)).toEqual({ '10%': 28000, 'Free delivery': 7900, 'Pay online': 40000 })
    expect(r.removed.map((x) => x.terms.title)).toEqual(['₹100'])
    expect(r.shipping).toBe(0)
  })

  it('Buy 2 get 1: the group broken, it comes off; whole again, it gives the cheapest piece', () => {
    const b2g1 = t({ id: 'd-b2g1', title: 'Buy 2 get 1', style: 'bxgy', buyQty: 2, getQty: 1, getBps: 10_000 })
    const { q, kept: k } = placed([{ variantId: 'a', qty: 1 }, { variantId: 'b', qty: 1 }, { variantId: 'c', qty: 1 }], [b2g1])
    expect(amounts(k)).toEqual({ 'Buy 2 get 1': 60000 })
    expect(replanKept([line('a'), line('b')], k, q.shipping).removed.map((x) => x.terms.title)).toEqual(['Buy 2 get 1'])
    expect(amounts(replanKept([line('a'), line('b', 2)], k, q.shipping).kept)).toEqual({ 'Buy 2 get 1': 90000 })
  })

  it('a free gift stays free while the rest of the bag reaches its minimum', () => {
    const gift = t({ id: 'd-gift', title: 'Free dupatta', style: 'free_gift', giftVariantId: 'c', minSubtotal: 300000 })
    const { q, kept: k } = placed([{ variantId: 'a', qty: 1 }, { variantId: 'b', qty: 1 }, { variantId: 'c', qty: 1 }], [gift])
    expect(amounts(k)).toEqual({ 'Free dupatta': 60000 })
    expect(replanKept([line('a'), line('b'), line('c')], k, q.shipping).productDisc).toEqual([0, 0, 60000])
    expect(replanKept([line('a'), line('c')], k, q.shipping).removed.map((x) => x.terms.title)).toEqual(['Free dupatta'])
  })
})

describe('kept terms (order_discounts, 0109)', () => {
  const row = { discountId: 'd', title: 'x', percentBps: null, amountOff: null, cap: null, minSubtotal: 0, tierMins: null, tierPercentBps: null, tierAmountsOff: null,
    targets: null, targetProducts: null, buyQty: null, getQty: null, getBps: null, giftVariantId: null }
  it('copies each style\'s terms into its columns only', () => {
    expect(termsCopy(kurtaOff, 0)).toMatchObject({ targets: 'products', targetProducts: ['pa'], tierMins: null, buyQty: null, giftVariantId: null })
    expect(termsCopy(t({ style: 'product_off', percentBps: 1000 }), 0)).toMatchObject({ targets: 'all', targetProducts: null })
    expect(termsCopy(steps, 360000)).toMatchObject({ percentBps: 1000, minSubtotal: 350000, tierMins: [200000, 350000], tierPercentBps: [500, 1000], tierAmountsOff: null, targets: null })
    expect(termsCopy(t({ tiers: [{ min: 100000, percentBps: null, amountOff: 5000 }] }), 0)).toMatchObject({ tierMins: [100000], tierPercentBps: null, tierAmountsOff: [5000] })
    // Steps of both kinds (the form never makes them): not kept; the step reached is.
    expect(termsCopy(t({ tiers: [{ min: 100000, percentBps: 500, amountOff: null }, { min: 200000, percentBps: null, amountOff: 20000 }] }), 150000))
      .toMatchObject({ percentBps: 500, minSubtotal: 100000, tierMins: null, tierPercentBps: null, tierAmountsOff: null })
    expect(termsCopy(t({ style: 'bxgy', buyQty: 2, getQty: 1 }), 0)).toMatchObject({ buyQty: 2, getQty: 1, getBps: 10_000, targets: 'all' })
    expect(termsCopy(payOnline, 0)).toMatchObject({ amountOff: 5000, targets: null, tierMins: null, buyQty: null })
  })
  it('a row placed before 0109: a product offer cannot be re-planned; any other re-plans on what it stored', () => {
    expect(storedTerms({ ...row, style: 'product_off', percentBps: 1000 })).toBeNull()
    expect(storedTerms({ ...row, style: 'order_off', percentBps: 500, minSubtotal: 200000 })).toMatchObject({ percentBps: 500, minSubtotal: 200000, targets: 'all' })
    expect(storedTerms({ ...row, style: 'order_off', percentBps: 500, minSubtotal: 200000 })).not.toHaveProperty('tiers')
  })
})
