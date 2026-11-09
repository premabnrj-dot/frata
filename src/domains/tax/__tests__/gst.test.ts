import { describe, expect, it } from 'vitest'
import { apportion, gstHeads, rateFor, shareCharges, split, supplyKind, taxOrder } from '../gst'
import { STATES, STATE_CODE, stateCode } from '@/domains/checkout/states'

describe('GST on apparel', () => {
  it('5% up to ₹2,500 a piece (taxable value), 18% above', () => {
    expect(rateFor('6211', 249000, true, new Date('2026-11-09T06:00:00Z'))).toBe(500)
    expect(rateFor('6211', 260000, true, new Date('2026-11-09T06:00:00Z'))).toBe(500) // ₹2,476.19 taxable at 5%
    expect(rateFor('6211', 262600, true, new Date('2026-11-09T06:00:00Z'))).toBe(1800) // ₹2,500.95 at 5%
    expect(rateFor('6104', 250000, false, new Date('2026-11-09T06:00:00Z'))).toBe(500)
    expect(rateFor('6104', 250001, false, new Date('2026-11-09T06:00:00Z'))).toBe(1800)
    expect(rateFor('6403', 199900, true, new Date('2026-11-09T06:00:00Z'))).toBe(500)
    expect(rateFor('7117', 99900, true, new Date('2026-11-09T06:00:00Z'))).toBe(300) // imitation jewellery: 3% (rates.ts)
    expect(rateFor(null, 99900, true, new Date('2026-11-09T06:00:00Z'))).toBeNull() // no HSN: no rate, never a guess
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
    const t = taxOrder(lines, 4900, { registered: true, pricesIncludeGst: true, date: new Date('2026-11-09T06:00:00Z') })
    expect(t.lines.map((l) => l.bps)).toEqual([500, 1800])
    expect(t.chargesGst + t.chargesTaxable).toBe(4900)
    expect(taxOrder(lines, 4900, { registered: false, pricesIncludeGst: true, date: new Date('2026-11-09T06:00:00Z') })).toEqual({
      lines: [{ bps: 0, taxable: 249000, gst: 0, chargeTaxable: 2144, chargeGst: 0 }, { bps: 0, taxable: 320000, gst: 0, chargeTaxable: 2756, chargeGst: 0 }], chargesGst: 0, chargesTaxable: 4900 })
  })
  it('each line keeps its share of the charges, and the shares add up to the order (the invoice reads them)', () => {
    const lines = [{ gross: 249000, unitPrice: 249000, hsn: '6211' }, { gross: 320000, unitPrice: 320000, hsn: '6211' }, { gross: 99900, unitPrice: 99900, hsn: '6109' }]
    const t = taxOrder(lines, 7900 + 4900, { registered: true, pricesIncludeGst: true, date: new Date('2026-11-09T06:00:00Z') })
    expect(t.lines.reduce((a, l) => a + l.chargeTaxable + l.chargeGst, 0)).toBe(12800)
    expect(t.lines.reduce((a, l) => a + l.chargeGst, 0)).toBe(t.chargesGst)
    // The 18% line's share is taxed at 18%: its share of GST is bigger than its share of value would give at 5%.
    const high = t.lines[1]!
    expect(high.chargeGst).toBe(high.chargeTaxable + high.chargeGst - Math.round(((high.chargeTaxable + high.chargeGst) * 10_000) / 11_800))
  })
  it('stored rates give the same shares as at checkout (an order placed before 1D gets its invoice from these)', () => {
    const lines = [{ gross: 249000, unitPrice: 249000, hsn: '6211' }, { gross: 320000, unitPrice: 320000, hsn: '6211' }]
    const t = taxOrder(lines, 12800, { registered: true, pricesIncludeGst: true, date: new Date('2026-11-09T06:00:00Z') })
    expect(shareCharges(t.lines, 12800, true)).toEqual(t.lines.map(({ chargeTaxable, chargeGst }) => ({ chargeTaxable, chargeGst })))
  })
  it('free lines still carry the delivery charge', () => {
    expect(shareCharges([{ bps: 500, taxable: 0 }], 7900, true)).toEqual([{ chargeTaxable: 7524, chargeGst: 376 }])
  })
})

describe('place of supply', () => {
  it('same state by code: CGST + SGST; another state, unknown or unregistered: IGST', () => {
    expect(supplyKind('08AAAAA0000A1Z5', stateCode('Rajasthan'))).toBe('intra')
    expect(supplyKind('08AAAAA0000A1Z5', stateCode('Maharashtra'))).toBe('inter')
    expect(supplyKind('08AAAAA0000A1Z5', stateCode('Atlantis'))).toBe('inter')
    expect(supplyKind(null, '08')).toBe('inter')
  })
  it('splits GST into halves, the odd paisa to SGST', () => {
    expect(gstHeads(1187, 'intra')).toEqual({ cgst: 593, sgst: 594, igst: 0 })
    expect(gstHeads(1187, 'inter')).toEqual({ cgst: 0, sgst: 0, igst: 1187 })
  })
  it('every state on the checkout list has a distinct GST code', () => {
    const codes = STATES.map((s) => STATE_CODE[s])
    expect(codes.every((c) => /^\d{2}$/.test(c))).toBe(true)
    expect(new Set(codes).size).toBe(STATES.length)
  })
})
