import { describe, expect, it } from 'vitest'
import { arrivalRange } from '../quote'
import { codFor, shippingFor, type DeliveryRules } from '../delivery'
import { codWhyNot } from '../cod-words'

// Delivery Zones task 1 (plan docs/plans/2026-11-12-delivery-zones.md): the regression net. Today's delivery charge,
// pay on delivery and arrival dates, pinned branch by branch BEFORE resolveDelivery replaces their insides. Without
// the app, a shop must get exactly these answers afterwards.
const base: DeliveryRules = { shippingFlat: 7900, freeShippingAbove: 199900, codOn: true, codMin: 0, codMax: 0, codCharge: 4900, codBlockedPincodes: ['110094'] }

describe('the floor today: delivery charge', () => {
  it('flat below the threshold, free at and above it, nothing when there is no charge', () => {
    expect(shippingFor(150000, base)).toBe(7900)
    expect(shippingFor(199900, base)).toBe(0)
    expect(shippingFor(250000, base)).toBe(0)
    expect(shippingFor(150000, { shippingFlat: 0, freeShippingAbove: 199900 })).toBe(0)
    expect(shippingFor(150000, { shippingFlat: 7900, freeShippingAbove: 0 })).toBe(7900) // no threshold: always charged
  })
})

describe('the floor today: pay on delivery', () => {
  it('offered with the total: bag + delivery + fee', () => {
    expect(codFor(150000, base, '302012')).toEqual({ offered: true, total: 150000 + 7900 + 4900, charge: 4900 })
    expect(codFor(250000, base, '302012')).toEqual({ offered: true, total: 250000 + 4900, charge: 4900 })
  })
  it('off, a blocked pincode (checked before the amount), below the minimum, above the maximum (delivery and fee counted)', () => {
    expect(codFor(150000, { ...base, codOn: false })).toEqual({ offered: false, reason: 'off' })
    expect(codFor(100, { ...base, codMin: 50000 }, '110094')).toEqual({ offered: false, reason: 'blocked_pincode', pincode: '110094' })
    expect(codFor(40000, { ...base, codMin: 50000 }, '302012')).toEqual({ offered: false, reason: 'below_min', min: 50000 })
    expect(codFor(290000, { ...base, codMax: 300000 }, '302012')).toEqual({ offered: true, total: 294900, charge: 4900 })
    expect(codFor(296000, { ...base, codMax: 300000 }, '302012')).toEqual({ offered: false, reason: 'above_max', max: 300000 })
  })
  it('no pincode yet (the product page): the blocked list is not applied', () => {
    expect(codFor(150000, base).offered).toBe(true)
    expect(codFor(150000, base, null).offered).toBe(true)
  })
  it('the words for each refusal', () => {
    const inr = (p: number) => `₹${p / 100}`
    expect(codWhyNot(codFor(1, { ...base, codOn: false }), inr)).toBe('This shop does not take Pay on delivery.')
    expect(codWhyNot(codFor(40000, { ...base, codMin: 50000 }), inr)).toBe('Pay on delivery is for orders from ₹500.')
    expect(codWhyNot(codFor(296000, { ...base, codMax: 300000 }), inr)).toBe('Pay on delivery is for orders up to ₹3000. Pay online for this bag.')
    expect(codWhyNot(codFor(1, base, '110094'), inr)).toBe('Pay on delivery is not offered to 110094.')
    expect(codWhyNot(codFor(150000, base), inr)).toBeNull()
  })
})

describe('the floor today: arrival dates', () => {
  const r = { dispatchDays: 1, metroDays: 2, restDays: 5 }
  const now = new Date('2026-11-12T05:30:00Z') // 11:00 IST, Thu 12 Nov
  it('in stock: dispatch + metro … dispatch + rest days, calendar days, no cutoff', () => {
    expect(arrivalRange([{ kind: 'in_stock', shipsBy: null, leadMinDays: null, leadMaxDays: null }], r, now)).toEqual({ from: '2026-11-15', to: '2026-11-18' })
  })
  it('the latest line wins; made-to-order adds its lead; pre-order counts from its date; an empty bag has none', () => {
    const lines = [
      { kind: 'in_stock' as const, shipsBy: null, leadMinDays: null, leadMaxDays: null },
      { kind: 'made_to_order' as const, shipsBy: null, leadMinDays: 3, leadMaxDays: 5 },
    ]
    expect(arrivalRange(lines, r, now)).toEqual({ from: '2026-11-18', to: '2026-11-23' })
    expect(arrivalRange([{ kind: 'preorder', shipsBy: '2026-12-01', leadMinDays: null, leadMaxDays: null }], r, now)).toEqual({ from: '2026-12-04', to: '2026-12-07' })
    expect(arrivalRange([], r, now)).toBeNull()
  })
})
