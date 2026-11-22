import { describe, expect, it } from 'vitest'
import { exampleOrder, exampleOrderLines } from '../example'

describe('the public pages’ example order', () => {
  it('is worked out by the profit engine, with the fee only when delivered', () => {
    const e = exampleOrder(200) // Launch: 2%
    expect(e.collect).toBe(249_000)
    expect(e.fee).toBe(4_743) // 2% of ₹2,371.43 net
    expect(e.ifDelivered).toBe(101_900) // ₹1,019 kept
    expect(e.ifReturned).toBe(-38_500) // a parcel that comes back costs shipping both ways, the COD fee, packing and ads
    expect(exampleOrder(100).ifDelivered).toBeGreaterThan(e.ifDelivered) // a lower fee keeps more
  })

  it('reads as lines that add up to what the brand keeps', () => {
    for (const bps of [200, 100, 50]) {
      const e = exampleOrder(bps)
      expect(e.gst).toBe(11_857) // 5% inside ₹2,490
      expect(e.collect - exampleOrderLines(e).reduce((s, l) => s + l.amount, 0)).toBe(e.ifDelivered)
    }
  })
})
