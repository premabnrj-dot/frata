import { describe, expect, it } from 'vitest'
import { keptOf, keptPerOrder, type KeptGroup } from '../kept'

const est = { delivery: 7000, ret: 7000, codFee: 5000 }
// A ₹900 COD order (net of GST ₹857.14 → 85714), COGS 40% (34286), merchandise net 85714, fee 2%.
const g = (o: Partial<KeptGroup>): KeptGroup => ({ outcome: 'delivered', n: 1, provider: 'self', cod: true, restocked: false, net: 85714, cogs: 34286, forward: null, rto: null, courierCodFee: null, gateway: 0, base: 85714, feeBps: 200, ...o })

describe('keptOf: ₹ kept after returns and lost parcels', () => {
  it('a delivered COD order shipped another way: the estimate, the COD fee, the plan fee', () => {
    const k = keptOf([g({})], est)
    // 85714 − 34286 − 7000 forward − 5000 COD fee − 1714 fee (2% of 85714, rounded) = 37714
    expect(k).toMatchObject({ kept: 37714, counted: 1, leftOut: 0, delivered: { n: 1, kept: 37714 }, basis: 'estimate' })
  })
  it('a return loses freight both ways (no COD fee on an estimated return); a lost parcel loses the goods too', () => {
    expect(keptOf([g({ outcome: 'rto', restocked: true })], est).rto).toEqual({ n: 1, kept: -14000 })
    expect(keptOf([g({ outcome: 'lost' })], est).lost).toEqual({ n: 1, kept: -(7000 + 34286) })
  })
  it('a return NOT put back in stock loses the goods as well; restocked or not is the came-back event\'s', () => {
    expect(keptOf([g({ outcome: 'rto' })], est).rto).toEqual({ n: 1, kept: -(14000 + 34286) })
    // `restocked` means nothing outside a return: a delivered order keeps its COGS whatever the flag says.
    expect(keptOf([g({ restocked: true })], est).kept).toBe(keptOf([g({})], est).kept)
  })
  it('a restocked return needs no COGS; any other outcome without COGS is left out, and counted as left out', () => {
    const k = keptOf([g({ outcome: 'rto', cogs: null, restocked: true }), g({ outcome: 'rto', cogs: null }), g({ cogs: null, n: 2 }), g({ outcome: 'lost', cogs: null })], est)
    expect(k).toMatchObject({ counted: 1, leftOut: 4, kept: -14000 })
  })
  it('Shiprocket: actual lines as summed; a missing line takes the estimate per parcel; with no estimate, left out', () => {
    const actual = keptOf([g({ provider: 'shiprocket', n: 2, net: 171428, cogs: 68572, base: 171428, forward: 12400, courierCodFee: 7200 })], est)
    expect(actual).toMatchObject({ counted: 2, basis: 'actual', kept: 171428 - 68572 - 12400 - 7200 - 3429 })
    // Two delivered COD parcels whose forward lines (₹124 together) arrived but not their COD fees: 2 × ₹50 estimated.
    const mixed = keptOf([g({ provider: 'shiprocket', n: 2, net: 171428, cogs: 68572, base: 171428, forward: 12400 })], est)
    expect(mixed).toMatchObject({ counted: 2, basis: 'estimate', kept: 171428 - 68572 - 12400 - 2 * 5000 - 3429 })
    expect(keptOf([g({ provider: 'shiprocket' })], null)).toMatchObject({ counted: 0, leftOut: 1, basis: null })
  })
  it('a group equals the sum of its orders: estimates scale by the count', () => {
    const one = keptOf([g({})], est).kept
    expect(keptOf([g({ n: 3, net: 3 * 85714, cogs: 3 * 34286, base: 3 * 85714 })], est).kept).toBeCloseTo(3 * one, -1)
  })
  it('no confirmed estimate: freight left out and said so ("before shipping costs")', () => {
    expect(keptOf([g({})], null)).toMatchObject({ kept: 85714 - 34286 - 1714, basis: 'none' })
  })
  it('per order with an outcome, never per delivered order alone', () => {
    const k = keptOf([g({}), g({ outcome: 'rto', restocked: true })], est)
    expect(keptPerOrder(k)).toBe(Math.round((37714 - 14000) / 2))
    expect(keptPerOrder(keptOf([], est))).toBeNull()
  })
})
