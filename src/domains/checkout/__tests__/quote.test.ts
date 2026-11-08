import { describe, expect, it } from 'vitest'
import { arrivalRange, quote, sellable, type ShopRules, type VariantRow } from '../quote'

const now = new Date('2026-11-07T10:00:00+05:30')
const rules: ShopRules = { shippingFlat: 7900, freeShippingAbove: 199900, codOn: true, codMin: 0, codMax: 300000, codCharge: 4900, codBlockedPincodes: ['110001'], pricesIncludeGst: true, registered: true, dispatchDays: 2, metroDays: 4, restDays: 7 }
const v = (id: string, over: Partial<VariantRow> = {}): VariantRow => ({
  variantId: id, productId: 'p', handle: 'kurta', title: 'Linen kurta set', status: 'active', publishAt: null, options: ['Size'], values: ['M'], sku: 'KS-1', price: 249000, compareAt: null,
  stock: 5, whenOut: 'stop', shipsBy: null, leadMinDays: null, leadMaxDays: null, preorderCap: null, held: 0, preordered: 0, owed: 0, hsn: '6211', image: null, ...over,
})

describe('what can be sold', () => {
  it('takes held units off stock (holds are derived)', () => {
    expect(sellable(v('a', { stock: 3, held: 2 }), 2, now)).toEqual({ qty: 1, kind: 'in_stock', problem: 'reduced' })
    expect(sellable(v('a', { stock: 2, held: 2 }), 1, now)).toEqual({ qty: 0, kind: 'in_stock', problem: 'sold_out' })
    // Stock that arrived for unpacked pre-orders is theirs first.
    expect(sellable(v('a', { stock: 3, owed: 2 }), 2, now)).toEqual({ qty: 1, kind: 'in_stock', problem: 'reduced' })
  })
  it('pre-orders up to the cap once stock is gone; never mixes kinds', () => {
    const p = { stock: 0, whenOut: 'preorder' as const, shipsBy: '2026-12-15', preorderCap: 3 }
    expect(sellable(v('a', { ...p, preordered: 1 }), 5, now)).toEqual({ qty: 2, kind: 'preorder', problem: 'reduced' })
    expect(sellable(v('a', { ...p, preordered: 3 }), 1, now).problem).toBe('sold_out')
    expect(sellable(v('a', { stock: 1, whenOut: 'preorder', shipsBy: '2026-12-15' }), 3, now)).toEqual({ qty: 1, kind: 'in_stock', problem: 'reduced' })
    expect(sellable(v('a', { stock: 0, whenOut: 'made_to_order', leadMinDays: 7, leadMaxDays: 10 }), 2, now).kind).toBe('made_to_order')
  })
  it('refuses drafts, scheduled drops and unpriced pieces', () => {
    expect(sellable(v('a', { status: 'draft' }), 1, now).problem).toBe('gone')
    expect(sellable(v('a', { publishAt: '2026-11-08T00:00:00Z' }), 1, now).problem).toBe('gone')
    expect(sellable(v('a', { status: 'unlisted' }), 1, now).problem).toBeNull()
    expect(sellable(v('a', { price: 0 }), 1, now).problem).toBe('gone')
  })
})

describe('quote', () => {
  it('prices a bag: free delivery above the threshold, COD fee only on COD, GST inside', () => {
    const q = quote([{ variantId: 'a', qty: 1 }], [v('a')], rules, now, '302001')
    expect(q.subtotal).toBe(249000)
    expect(q.shipping).toBe(0)
    expect(q.prepaid.total).toBe(249000)
    expect(q.cod.total).toBe(253900)
    expect(q.cod.offer.offered).toBe(true)
    expect(q.prepaid.lines[0]).toMatchObject({ gstBps: 500, taxable: 237143, gst: 11857, discount: 0 })
    expect(q.prepaid.merchandiseNet).toBe(237143)
    expect(q.cod.gst - q.prepaid.gst).toBe(233) // GST on the ₹49 fee at 5%
  })
  it('adds GST when prices exclude it; charges delivery below the threshold', () => {
    const q = quote([{ variantId: 'a', qty: 1 }], [v('a', { price: 99900 })], { ...rules, pricesIncludeGst: false }, now)
    expect(q.shipping).toBe(7900)
    expect(q.prepaid.total).toBe(99900 + 7900 + q.prepaid.gst)
  })
  it('says when COD is not offered, and why', () => {
    expect(quote([{ variantId: 'a', qty: 1 }], [v('a')], rules, now, '110001').cod).toMatchObject({ total: 0, offer: { offered: false, reason: 'blocked_pincode' } })
    expect(quote([{ variantId: 'a', qty: 2 }], [v('a')], rules, now).cod.offer).toMatchObject({ offered: false, reason: 'above_max' })
  })
  it('drops unknown ids, merges duplicates, clamps quantities, empty when nothing can be bought', () => {
    const q = quote([{ variantId: 'x', qty: 1 }, { variantId: 'a', qty: 99 }, { variantId: 'a', qty: 1 }], [v('a', { stock: 20 })], rules, now)
    expect(q.missing).toEqual(['x'])
    expect(q.lines).toHaveLength(1)
    expect(q.lines[0]!.qty).toBe(10)
    expect(quote([{ variantId: 'a', qty: 1 }], [v('a', { stock: 0 })], rules, now).empty).toBe(true)
  })
  it('arrives after the latest line: dispatch + metro…rest days, pre-orders from their date', () => {
    expect(arrivalRange([{ kind: 'in_stock', shipsBy: null, leadMinDays: null, leadMaxDays: null }], rules, now)).toEqual({ from: '2026-11-13', to: '2026-11-16' })
    expect(arrivalRange([{ kind: 'preorder', shipsBy: '2026-12-15', leadMinDays: null, leadMaxDays: null }], rules, now)).toEqual({ from: '2026-12-21', to: '2026-12-24' })
  })
})
