import { describe, expect, it } from 'vitest'
import { offerExample } from '../offer-cost'
import { keptWithOff } from '../offer-kept'

const est = { delivery: 7800, ret: 7800, codFee: 0 }
describe('offerExample: one piece of the best seller, delivered', () => {
  it('a ₹2,490 piece at 5% GST inside the price: ₹249 off takes less than ₹249 (the GST in it, the fee on it)', () => {
    const x = offerExample({ price: 249000, gstBps: 500, inclusive: true, cogs: 99000, est, feeBps: 200 })!
    const after = keptWithOff(x, 24900)
    expect(x.keptAt0 - after).toBeGreaterThan(22000)
    expect(x.keptAt0 - after).toBeLessThan(24900)
  })
  it('no goods cost: no example (never ₹0)', () => {
    expect(offerExample({ price: 249000, gstBps: 500, inclusive: true, cogs: null as unknown as number, est, feeBps: 200 })).toBeNull()
  })
})
