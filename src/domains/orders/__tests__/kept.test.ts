import { describe, expect, it } from 'vitest'
import { feeForOrder, keptOf, keptPerOrder, type KeptGroup } from '../kept'

const est = { delivery: 7000, ret: 7000, codFee: 5000 }
// A ₹900 COD order (net of GST ₹857.14 → 85714), COGS 40% (34286), merchandise net 85714, fee 2%.
const g = (o: Partial<KeptGroup>): KeptGroup => ({ outcome: 'delivered', n: 1, provider: 'self', cod: true, net: 85714, cogs: 34286, forward: null, rto: null, courierCodFee: null, gateway: 0, base: 85714, feeBps: 200, ...o })

describe('keptOf: ₹ kept after returns and lost parcels', () => {
  it('a delivered COD order shipped another way: the estimate, the COD fee, the plan fee', () => {
    const k = keptOf([g({})], est)
    // 85714 − 34286 − 7000 forward − 5000 COD fee − 1714 fee (2% of 85714, rounded) = 37714
    expect(k).toMatchObject({ kept: 37714, counted: 1, leftOut: 0, delivered: { n: 1, kept: 37714 }, basis: 'estimate' })
  })
  it('a return loses freight both ways (no COD fee on an estimated return); a lost parcel loses the goods too', () => {
    expect(keptOf([g({ outcome: 'rto' })], est).rto).toEqual({ n: 1, kept: -14000 })
    expect(keptOf([g({ outcome: 'lost' })], est).lost).toEqual({ n: 1, kept: -(7000 + 34286) })
  })
  it('a return needs no COGS; a delivered or lost order without COGS is left out, and counted as left out', () => {
    const k = keptOf([g({ outcome: 'rto', cogs: null }), g({ cogs: null, n: 2 }), g({ outcome: 'lost', cogs: null })], est)
    expect(k).toMatchObject({ counted: 1, leftOut: 3, kept: -14000 })
  })
  it('Shiprocket: actual lines as summed; pending freight is left out, never ₹0', () => {
    const actual = keptOf([g({ provider: 'shiprocket', n: 2, net: 171428, cogs: 68572, base: 171428, forward: 12400, courierCodFee: 7200 })], est)
    expect(actual).toMatchObject({ counted: 2, basis: 'actual', kept: 171428 - 68572 - 12400 - 7200 - 3429 })
    expect(keptOf([g({ provider: 'shiprocket' })], est)).toMatchObject({ counted: 0, leftOut: 1, basis: null })
  })
  it('a group equals the sum of its orders: estimates scale by the count', () => {
    const one = keptOf([g({})], est).kept
    expect(keptOf([g({ n: 3, net: 3 * 85714, cogs: 3 * 34286, base: 3 * 85714 })], est).kept).toBeCloseTo(3 * one, -1)
  })
  it('no confirmed estimate: freight left out and said so ("before shipping costs")', () => {
    expect(keptOf([g({})], null)).toMatchObject({ kept: 85714 - 34286 - 1714, basis: 'none' })
  })
  it('per order with an outcome, never per delivered order alone', () => {
    const k = keptOf([g({}), g({ outcome: 'rto' })], est)
    expect(keptPerOrder(k)).toBe(Math.round((37714 - 14000) / 2))
    expect(keptPerOrder(keptOf([], est))).toBeNull()
  })
})

describe('feeForOrder (stand-in for billing B0)', () => {
  it('the plan version in force at the billable moment', () => {
    const h = [{ startsAt: new Date('2026-01-01'), feeBps: 200 }, { startsAt: new Date('2026-06-01'), feeBps: 100 }]
    expect(feeForOrder(h, new Date('2025-12-31'))).toBeNull()
    expect(feeForOrder(h, new Date('2026-03-01'))).toBe(200)
    expect(feeForOrder(h, new Date('2026-06-01'))).toBe(100)
  })
})
