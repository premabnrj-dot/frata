import { describe, expect, it } from 'vitest'
import { amountFor, planOffers, priceMethod, type DiscountTerms } from '../discounts'
import { quote, type ShopRules, type VariantRow } from '../quote'

const now = new Date('2026-11-08T10:00:00+05:30')
const rules: ShopRules = { shippingFlat: 7900, freeShippingAbove: 149900, codOn: true, codMin: 0, codMax: 500000, codCharge: 4900, pricesIncludeGst: true, registered: true, dispatchDays: 2, metroDays: 2, restDays: 5 }
const v = (id: string, price: number, over: Partial<VariantRow> = {}): VariantRow => ({
  variantId: id, productId: 'p' + id, handle: 'h' + id, title: 'T' + id, status: 'active', publishAt: null, options: [], values: [], sku: null, price, compareAt: null,
  stock: 10, whenOut: 'stop', shipsBy: null, leadMinDays: null, leadMaxDays: null, preorderCap: null, held: 0, preordered: 0, owed: 0, hsn: '6211', image: null, ...over,
})
const t = (over: Partial<DiscountTerms>): DiscountTerms => ({
  id: 'd1', title: 'Offer', style: 'order_off', percentBps: null, amountOff: null, cap: null, minSubtotal: 0, combinesWithPayment: true, listed: true, code: null, codeId: null, ...over,
})
// The worked example in the mockup: a ₹2,800 kurta and a ₹900 dupatta, 15% off above ₹2,999, ₹50 off paying online.
const kurta = v('a', 280000), dupatta = v('b', 90000)
const bag = [{ variantId: 'a', qty: 1 }, { variantId: 'b', qty: 1 }]
const diwali = t({ id: 'd-diwali', title: 'Diwali', percentBps: 1500, minSubtotal: 299900, code: 'DIWALI15', codeId: 'c1' })
const online = t({ id: 'd-online', title: 'Pay online', style: 'pay_online', amountOff: 5000 })

describe('amountFor', () => {
  it('percent with a cap, amount, and the minimum', () => {
    expect(amountFor(t({ percentBps: 1000 }), 199900)).toBe(19990)
    expect(amountFor(t({ percentBps: 1000, cap: 15000 }), 199900)).toBe(15000)
    expect(amountFor(t({ amountOff: 50000 }), 30000)).toBe(30000) // never more than the base
    expect(amountFor(t({ percentBps: 1000, minSubtotal: 200000 }), 199900)).toBe(0)
    expect(amountFor(t({ style: 'free_shipping' }), 199900)).toBe(0)
  })
})

describe('planOffers', () => {
  it('best per class; a typed code applies only when it is the best of its class; one answer when it does not', () => {
    const auto = t({ id: 'd-auto', percentBps: 1000, listed: false })
    const code = t({ id: 'd-code', percentBps: 500, code: 'SMALL5', listed: false })
    expect(planOffers(300000, [auto, code], 'small5')).toMatchObject({ order: { discountId: 'd-auto', amount: 30000 }, code: 'not_applied' })
    expect(planOffers(300000, [auto, t({ ...code, percentBps: 2000 })], 'SMALL5')).toMatchObject({ order: { discountId: 'd-code', amount: 60000 }, code: 'applied' })
    expect(planOffers(300000, [auto], 'NOPE')).toMatchObject({ code: 'not_applied' })
    // An unlisted code offer never applies untyped.
    expect(planOffers(300000, [code], null).order).toBeNull()
  })
  it('lists offers within reach with what they need, and hides a listed offer beaten in its class', () => {
    const p = planOffers(280000, [diwali, online, t({ id: 'd-small', percentBps: 500 })], null)
    expect(p.order?.discountId).toBe('d-small')
    expect(p.listed).toEqual([
      { title: 'Diwali', code: 'DIWALI15', style: 'order_off', applied: false, need: { kind: 'add', amount: 19900 } },
      { title: 'Pay online', code: null, style: 'pay_online', applied: true, need: { kind: 'pay_online' } },
      { title: 'Offer', code: null, style: 'order_off', applied: true, need: null },
    ])
    expect(planOffers(380000, [diwali, t({ id: 'd-small', percentBps: 500 })], null).listed.map((l) => l.title)).toEqual(['Diwali'])
  })
  it('withholds the payment saving for both ways of paying when the order offer does not combine', () => {
    expect(planOffers(370000, [t({ ...diwali, combinesWithPayment: false }), online], null).payment).toBeNull()
    expect(planOffers(370000, [diwali, online], null).payment?.amount).toBe(5000)
  })
  it('tests the payment minimum after the order discount', () => {
    expect(planOffers(370000, [diwali, t({ ...online, minSubtotal: 320000 })], null).payment).toBeNull() // 3,700 − 555 = 3,145
  })
})

describe('quote with offers', () => {
  it('the worked example: ₹555 spread by value, ₹50 more online, free shipping on the discounted bag', () => {
    const q = quote(bag, [kurta, dupatta], rules, now, '302001', { offers: [diwali, online] })
    expect(q.subtotal).toBe(370000)
    expect(q.shipping).toBe(0)
    expect(q.prepaid.discount).toBe(60500)
    expect(q.prepaid.total).toBe(309500)
    expect(q.cod.discount).toBe(55500)
    expect(q.cod.total).toBe(314500 + 4900)
    expect(q.cod.lines.map((l) => l.discount)).toEqual([42000, 13500])
    expect(q.prepaid.applied.map((a) => [a.class, a.amount])).toEqual([['order', 55500], ['payment', 5000]])
    expect(q.cod.applied.map((a) => a.class)).toEqual(['order'])
  })
  it('decides each piece’s GST rate on its discounted value, per way of paying', () => {
    // ₹2,650 inclusive is ₹2,524 before GST: 18%. ₹100 off online makes it ₹2,550 → ₹2,429: 5%.
    const q = quote([{ variantId: 'a', qty: 1 }], [v('a', 265000)], rules, now, null, { offers: [t({ ...online, amountOff: 10000 })] })
    expect(q.cod.lines[0]!.gstBps).toBe(1800)
    expect(q.prepaid.lines[0]!.gstBps).toBe(500)
    expect(q.prepaid.lines[0]!.taxable + q.prepaid.lines[0]!.gst).toBe(255000)
    // Two pieces on one line: the rate follows the discounted piece.
    const two = quote([{ variantId: 'a', qty: 2 }], [v('a', 265000)], { ...rules, codMax: 0 }, now, null, { offers: [t({ percentBps: 1000 })] })
    expect(two.cod.lines[0]!.gstBps).toBe(500) // 2 × 2,650 − 10% = 2,385 a piece
  })
  it('tests free shipping and the COD limits after the order discount, before the payment saving', () => {
    const r = { ...rules, freeShippingAbove: 300000, codMin: 300000 }
    const q = quote(bag, [kurta, dupatta], r, now, null, { offers: [diwali, online] }) // 3,145 after the order offer
    expect(q.shipping).toBe(0)
    expect(q.cod.offer.offered).toBe(true)
    const q2 = quote(bag, [kurta, dupatta], { ...r, freeShippingAbove: 320000, codMin: 320000 }, now, null, { offers: [diwali, online] })
    expect(q2.shipping).toBe(7900) // the same for both ways of paying
    expect(q2.cod.offer.offered).toBe(false)
  })
  it('a free-shipping offer waives what would be charged, and says so only then', () => {
    const fs = t({ id: 'd-fs', title: 'Free delivery', style: 'free_shipping', minSubtotal: 50000 })
    const q = quote([{ variantId: 'b', qty: 1 }], [dupatta], rules, now, null, { offers: [fs] })
    expect(q.shipping).toBe(0)
    expect(q.prepaid.applied).toMatchObject([{ class: 'shipping', amount: 7900 }])
    expect(quote(bag, [kurta, dupatta], rules, now, null, { offers: [fs] }).prepaid.applied).toEqual([])
  })
  it('prices exclusive of GST and unregistered shops', () => {
    const q = quote(bag, [kurta, dupatta], { ...rules, pricesIncludeGst: false }, now, null, { offers: [diwali] })
    expect(q.prepaid.total).toBe(370000 - 55500 + q.prepaid.gst)
    const u = quote(bag, [kurta, dupatta], { ...rules, registered: false }, now, null, { offers: [diwali] })
    expect(u.prepaid.gst).toBe(0)
    expect(u.prepaid.merchandiseNet).toBe(314500)
  })
  it('no offers: the same figures as before offers existed', () => {
    const q = quote(bag, [kurta, dupatta], rules, now)
    expect(q.prepaid).toMatchObject({ discount: 0, total: 370000, applied: [] })
    expect(q.offers).toEqual({ listed: [], code: null })
  })
})

describe('priceMethod', () => {
  it('spreads to the paise and sums exactly', () => {
    const m = priceMethod([{ gross: 100001, qty: 1, hsn: '6211' }, { gross: 33333, qty: 3, hsn: '6211' }, { gross: 7, qty: 1, hsn: null }], 9999, 1001, 7900, { registered: true, pricesIncludeGst: true })
    expect(m.discount).toBe(11000)
    expect(m.lines.reduce((a, l) => a + l.discount, 0)).toBe(11000)
    expect(m.total).toBe(100001 + 33333 + 7 - 11000 + 7900)
  })
})

describe('O·2: product offers, Buy X get Y, gift, tiers, typed codes', () => {
  const tee = (id: string, price: number) => v(id, price, { productId: 'tee-' + id })
  const line = (id: string, price: number, qty = 1, productId = 'p' + id) => ({ productId, variantId: id, unitPrice: price, qty })
  it('% off chosen products only, capped on the whole offer', () => {
    const sale = t({ id: 'd-sale', title: 'Kurta sale', style: 'product_off', percentBps: 2000, targets: ['pa'] })
    const p = planOffers([line('a', 280000), line('b', 90000)], [sale], null)
    expect(p.productDisc).toEqual([56000, 0])
    expect(p.products.map((x) => [x.discountId, x.amount])).toEqual([['d-sale', 56000]])
    expect(planOffers([line('a', 280000, 2)], [{ ...sale, cap: 50000 }], null).productDisc).toEqual([50000])
  })
  it('Buy 2 get 1: the cheapest of each group free, the saving spread over the group by value; short bags are told', () => {
    const b2g1 = t({ id: 'd-b2g1', title: 'Buy 2 get 1', style: 'bxgy', buyQty: 2, getQty: 1, getBps: 10000, targets: 'all' })
    const p = planOffers([line('a', 79900, 2), line('b', 69900)], [b2g1], null)
    expect(p.products[0]!.amount).toBe(69900) // the ₹699 tee free
    expect(p.productDisc.reduce((a, b) => a + b, 0)).toBe(69900)
    expect(p.productDisc[1]).toBeLessThan(69900) // spread, not all on the free piece
    const short = planOffers([line('a', 79900)], [b2g1], null)
    expect(short.listed).toEqual([{ title: 'Buy 2 get 1', code: null, style: 'bxgy', applied: false, need: { kind: 'add_items', n: 2 } }])
  })
  it('a free gift: free once the rest reaches the minimum; asks to add it, or how much more', () => {
    const gift = t({ id: 'd-gift', title: 'Gift', style: 'free_gift', minSubtotal: 200000, giftVariantId: 'g' })
    expect(planOffers([line('a', 249000), line('g', 49900)], [gift], null).productDisc).toEqual([0, 49900])
    expect(planOffers([line('a', 249000)], [gift], null).listed[0]!.need).toEqual({ kind: 'gift', variantId: 'g' })
    expect(planOffers([line('a', 150000), line('g', 49900)], [gift], null).listed[0]!.need).toEqual({ kind: 'add', amount: 50000 })
  })
  it('greedy and stable: the offer saving most takes its lines; a line takes one product offer', () => {
    const small = t({ id: 'd-1', title: 'Small', style: 'product_off', percentBps: 1000, targets: 'all' })
    const big = t({ id: 'd-2', title: 'Big', style: 'product_off', percentBps: 3000, targets: ['pa'] })
    const p = planOffers([line('a', 100000), line('b', 100000)], [small, big], null)
    expect(p.productDisc).toEqual([30000, 10000])
    expect(planOffers([line('a', 100000), line('b', 100000)], [big, small], null).productDisc).toEqual([30000, 10000])
  })
  it('tiers: the highest step reached; the next step is what the bag needs', () => {
    const tiers = t({ id: 'd-t', title: 'Spend more', percentBps: null, tiers: [{ min: 199900, percentBps: 1000, amountOff: null }, { min: 299900, percentBps: 1500, amountOff: null }] })
    const p = planOffers(250000, [tiers], null)
    expect(p.order?.amount).toBe(25000)
    expect(p.listed[0]).toMatchObject({ applied: true, need: { kind: 'add', amount: 49900 } })
    expect(planOffers(150000, [tiers], null).listed[0]!.need).toEqual({ kind: 'add', amount: 49900 })
  })
  it('order offers apply to the bag after product offers; a typed creator code reaches an unlisted offer', () => {
    const sale = t({ id: 'd-sale', title: 'Sale', style: 'product_off', percentBps: 5000, targets: 'all' })
    const vip = t({ id: 'd-vip', title: 'VIP', amountOff: 10000, listed: false, code: 'VIP100', codeId: 'c-pub' })
    const p = planOffers([line('a', 300000)], [sale, vip], { text: 'RIYA100', discountId: 'd-vip', codeId: 'c-riya' })
    expect([p.productDisc[0], p.order?.amount, p.code]).toEqual([150000, 10000, 'applied'])
    expect(planOffers([line('a', 300000)], [sale, vip], { text: 'NOPE', discountId: null, codeId: null }).code).toBe('not_applied')
  })
  it('the quote: product discounts stay on their lines; the order offer and the saving spread on what is left; GST per piece', () => {
    const sale = t({ id: 'd-sale', title: 'Kurta sale', style: 'product_off', percentBps: 2000, targets: ['pa'] })
    const q = quote(bag, [kurta, dupatta], rules, now, null, { offers: [sale, online] })
    expect(q.prepaid.lines.map((l) => l.discount)).toEqual([56000 + Math.round(5000 * 224000 / 314000), 5000 - Math.round(5000 * 224000 / 314000)])
    expect(q.prepaid.lines[0]!.gstBps).toBe(500) // ₹2,800 − 20% = ₹2,240: 5%
    expect(q.prepaid.total).toBe(370000 - 56000 - 5000)
    expect(q.prepaid.applied.map((a) => a.class)).toEqual(['product', 'payment'])
    void tee
  })
})
