import { describe, expect, it } from 'vitest'
import { apportion, rateFor, split, taxOrder } from '../gst'

describe('GST on apparel', () => {
  it('5% up to ₹2,500 a piece (taxable value), 18% above', () => {
    expect(rateFor('6211', 249000, true)).toBe(500)
    expect(rateFor('6211', 260000, true)).toBe(500) // ₹2,476.19 taxable at 5%
    expect(rateFor('6211', 262600, true)).toBe(1800) // ₹2,500.95 at 5%
    expect(rateFor('6104', 250000, false)).toBe(500)
    expect(rateFor('6104', 250001, false)).toBe(1800)
    expect(rateFor('6403', 199900, true)).toBe(500)
    expect(rateFor('7117', 99900, true)).toBe(1800) // not apparel: 18% until set
    expect(rateFor(null, 99900, true)).toBe(1800)
  })
  it('splits inclusive and exclusive amounts', () => {
    expect(split(249000, 500, true)).toEqual({ taxable: 237143, gst: 11857 })
    expect(split(237143, 500, false)).toEqual({ taxable: 237143, gst: 11857 })
    expect(split(100, 0, true)).toEqual({ taxable: 100, gst: 0 })
  })
  it('shares charges exactly', () => {
    expect(apportion(4900, [1, 1, 1])).toEqual([1634, 1633, 1633])
    expect(apportion(4900, [0, 0])).toEqual([0, 0])
    expect(apportion(100, [3, 1]).reduce((a, b) => a + b)).toBe(100)
  })
  it('taxes the charges at each line rate; no GSTIN, no GST', () => {
    const lines = [{ gross: 249000, unitPrice: 249000, hsn: '6211' }, { gross: 320000, unitPrice: 320000, hsn: '6211' }]
    const t = taxOrder(lines, 4900, { registered: true, pricesIncludeGst: true })
    expect(t.lines.map((l) => l.bps)).toEqual([500, 1800])
    expect(t.chargesGst + t.chargesTaxable).toBe(4900)
    expect(taxOrder(lines, 4900, { registered: false, pricesIncludeGst: true })).toEqual({ lines: [{ bps: 0, taxable: 249000, gst: 0 }, { bps: 0, taxable: 320000, gst: 0 }], chargesGst: 0, chargesTaxable: 4900 })
  })
})
