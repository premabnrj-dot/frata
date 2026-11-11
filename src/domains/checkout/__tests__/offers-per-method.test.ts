// The best offer for each way of paying (design-language rule 46; shop stress test 2026-11-11). An order offer that
// does not combine with the pay-online saving used to win both cards, so a shopper paying online could pay more than
// the saving alone would have cost. Paying online now takes the better of the two; paying on delivery is unchanged.
import { describe, expect, it } from 'vitest'
import { reprice, type StoredPricing } from '@/domains/orders/amounts'
import type { DiscountTerms } from '../discounts'
import { keptOffers, quote, type Quote, type ShopRules, type VariantRow } from '../quote'

const now = new Date('2026-11-11T10:00:00+05:30')
const rules: ShopRules = { shippingFlat: 0, freeShippingAbove: 0, codOn: true, codMin: 0, codMax: 0, codCharge: 4900, pricesIncludeGst: true, registered: true, dispatchDays: 2, metroDays: 2, restDays: 5 }
const v = (id: string, price: number): VariantRow => ({
  variantId: id, productId: 'p' + id, handle: 'h' + id, title: 'T' + id, status: 'active', publishAt: null, options: [], values: [], sku: null, price, compareAt: null,
  stock: 10, whenOut: 'stop', shipsBy: null, leadMinDays: null, leadMaxDays: null, preorderCap: null, held: 0, preordered: 0, owed: 0, hsn: '6211', image: null,
})
const t = (over: Partial<DiscountTerms>): DiscountTerms => ({
  id: 'd1', title: 'Offer', style: 'order_off', percentBps: null, amountOff: null, cap: null, minSubtotal: 0, combinesWithPayment: true, listed: true, code: null, codeId: null, ...over,
})
// The stress test's bag: a ₹999 bag, an automatic 5% that does not combine, ₹100 off paying online.
const bag999 = v('a', 99900)
const five = t({ id: 'd-five', title: '5% off', percentBps: 500, combinesWithPayment: false })
const online = t({ id: 'd-online', title: 'Pay online', style: 'pay_online', amountOff: 10000 })
const classes = (a: { class: string; discountId: string }[]) => a.map((x) => [x.class, x.discountId])

/** The order as placement stores it, priced again the way reprice() reads it (reprice.ts storedPricing). */
const stored = (q: Quote, method: 'cod' | 'prepaid'): StoredPricing => ({
  lines: q.lines.filter((l) => l.qty > 0).map((l, i) => ({ unitPrice: l.unitPrice, qty: l.qty, hsn: l.hsn, productDiscount: (method === 'cod' ? q.cod : q.prepaid).lines[i]!.productDiscount })),
  applied: keptOffers(q, method).map((a) => ({ class: a.class, amount: a.amount, method: a.method })),
  shipping: q.shipping, registered: rules.registered, pricesIncludeGst: rules.pricesIncludeGst, placedAt: now,
})

describe('the best offer per way of paying', () => {
  it('₹999: the pay-online saving alone beats a 5% that does not combine; on delivery the 5% stays', () => {
    const q = quote([{ variantId: 'a', qty: 1 }], [bag999], rules, now, null, { offers: [five, online] })
    expect(q.prepaid.total).toBe(89900) // was ₹949.05: 5% and no saving
    expect(classes(q.prepaid.applied)).toEqual([['payment', 'd-online']])
    expect(q.cod.total).toBe(99900 - 4995 + 4900)
    expect(classes(q.cod.applied)).toEqual([['order', 'd-five']])
    // Each card names what it gets: the 5% on delivery, the saving online.
    expect(q.offers.listed).toEqual([
      { title: '5% off', code: null, style: 'order_off', applied: true, need: { kind: 'pay_on_delivery' } },
      { title: 'Pay online', code: null, style: 'pay_online', applied: true, need: { kind: 'pay_online' } },
    ])
  })
  it('a tie keeps the order offer on both cards', () => {
    const ten = t({ ...five, id: 'd-ten', title: '10% off', percentBps: 1000 })
    const q = quote([{ variantId: 'a', qty: 1 }], [v('a', 100000)], rules, now, null, { offers: [ten, online] }) // ₹100 either way
    expect(q.prepaid.total).toBe(90000)
    expect(classes(q.prepaid.applied)).toEqual([['order', 'd-ten']])
    expect(classes(q.cod.applied)).toEqual([['order', 'd-ten']])
    expect(q.offers.listed.map((l) => [l.title, l.applied, l.need])).toEqual([['10% off', true, null]])
  })
  it('a smaller order offer that combines goes with the saving online when the pair is better', () => {
    const ten = t({ ...five, id: 'd-ten', title: '10% off', percentBps: 1000 })
    const small = t({ id: 'd-small', title: '5% with saving', percentBps: 500 })
    const q = quote([{ variantId: 'a', qty: 1 }], [v('a', 200000)], rules, now, null, { offers: [ten, small, { ...online, amountOff: 15000 }] })
    expect(q.prepaid.total).toBe(200000 - 10000 - 15000) // 5% + ₹150 = ₹250 > 10% = ₹200
    expect(classes(q.prepaid.applied)).toEqual([['order', 'd-small'], ['payment', 'd-online']])
    expect(classes(q.cod.applied)).toEqual([['order', 'd-ten']])
    expect(q.offers.listed.map((l) => [l.title, l.need])).toEqual([['10% off', { kind: 'pay_on_delivery' }], ['5% with saving', { kind: 'pay_online' }], ['Pay online', { kind: 'pay_online' }]])
    // With ₹100 off online the pair is ₹200: a tie, so 10% stays on both.
    const tie = quote([{ variantId: 'a', qty: 1 }], [v('a', 200000)], rules, now, null, { offers: [ten, small, online] })
    expect(classes(tie.prepaid.applied)).toEqual([['order', 'd-ten']])
  })
  it('a typed code that does not combine: applied (it wins on delivery), and online the saving', () => {
    const code = t({ ...five, id: 'd-code', title: 'Insta 5', listed: false, code: 'INSTA5', codeId: 'c-insta' })
    const q = quote([{ variantId: 'a', qty: 1 }], [bag999], rules, now, null, { offers: [code, online], code: 'insta5' })
    expect(q.offers.code).toBe('applied') // never "this code doesn't work here"
    expect(classes(q.prepaid.applied)).toEqual([['payment', 'd-online']])
    expect(classes(q.cod.applied)).toEqual([['order', 'd-code']])
    // No Pay on delivery for this bag: the code helps nowhere, and says so.
    const noCod = quote([{ variantId: 'a', qty: 1 }], [bag999], { ...rules, codOn: false }, now, null, { offers: [code, online], code: 'INSTA5' })
    expect(noCod.offers.code).toBe('not_applied')
    expect(noCod.offers.listed.map((l) => l.title)).toEqual(['Pay online'])
  })
  it('a product offer stays on its line for both; the choice is made on what is left', () => {
    const sale = t({ id: 'd-sale', title: 'Sale', style: 'product_off', percentBps: 1000, targets: 'all' })
    const q = quote([{ variantId: 'a', qty: 1 }], [bag999], rules, now, null, { offers: [sale, five, online] })
    // 999 − 99.90 = 899.10; 5% of that is 44.95 < ₹100.
    expect(q.prepaid.total).toBe(99900 - 9990 - 10000)
    expect(classes(q.prepaid.applied)).toEqual([['product', 'd-sale'], ['payment', 'd-online']])
    expect(classes(q.cod.applied)).toEqual([['product', 'd-sale'], ['order', 'd-five']])
    expect(q.cod.total).toBe(99900 - 9990 - 4495 + 4900)
    expect(q.prepaid.lines[0]!.productDiscount).toBe(q.cod.lines[0]!.productDiscount)
  })
  it('placement keeps both ways: the order offer online only, the one it replaced on delivery only', () => {
    const ten = t({ ...five, id: 'd-ten', percentBps: 1000 })
    const small = t({ id: 'd-small', percentBps: 500 })
    const q = quote([{ variantId: 'a', qty: 1 }], [v('a', 200000)], rules, now, null, { offers: [ten, small, { ...online, amountOff: 15000 }] })
    expect(keptOffers(q, 'prepaid').map((a) => [a.discountId, a.method])).toEqual([['d-small', 'prepaid'], ['d-online', null], ['d-ten', 'cod']])
    expect(keptOffers(q, 'cod').map((a) => [a.discountId, a.method])).toEqual([['d-ten', null]])
    // One plan for both: nothing is marked.
    const one = quote([{ variantId: 'a', qty: 1 }], [v('a', 200000)], rules, now, null, { offers: [small, online] })
    expect(keptOffers(one, 'prepaid').map((a) => [a.discountId, a.method])).toEqual([['d-small', null], ['d-online', null]])
  })
})

describe('reprice from what placement kept, both ways', () => {
  const ten = t({ ...five, id: 'd-ten', percentBps: 1000 })
  const small = t({ id: 'd-small', percentBps: 500 })
  const cases: [string, VariantRow, DiscountTerms[]][] = [
    ['₹999: the saving alone online', bag999, [five, online]],
    ['a combining offer with the saving online', v('a', 200000), [ten, small, { ...online, amountOff: 15000 }]],
    ['one plan for both', v('a', 200000), [small, online]],
    // ₹2,650 inclusive: each way's discount decides the piece's slab on its own.
    ['across the GST slab', v('a', 265000), [five, online]],
  ]
  for (const [name, row, offers] of cases) {
    it(`${name}: online → on delivery (a switch) and back (a capture after it) give the quote's figures`, () => {
      const q = quote([{ variantId: 'a', qty: 1 }], [row], rules, now, null, { offers })
      const s = stored(q, 'prepaid')
      const pre = reprice(s, 'prepaid')
      expect({ total: pre.total, discount: pre.discount, lines: pre.lines }).toEqual({ total: q.prepaid.total, discount: q.prepaid.discount, lines: q.prepaid.lines })
      const { price: cod } = reprice(s, 'cod', rules, null)
      expect({ total: cod!.total, discount: cod!.discount, lines: cod!.lines }).toEqual({ total: q.cod.total, discount: q.cod.discount, lines: q.cod.lines })
      // An order placed on delivery keeps its own plan.
      const { price: placedCod } = reprice(stored(q, 'cod'), 'cod', rules, null)
      expect(placedCod!.total).toBe(q.cod.total)
    })
  }
})
