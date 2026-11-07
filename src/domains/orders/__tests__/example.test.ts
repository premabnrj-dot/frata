import { describe, expect, it } from 'vitest'
import { exampleOrder } from '../example'

describe('the public pages’ example order', () => {
  it('is worked out by the profit engine, with the fee only when delivered', () => {
    const e = exampleOrder(200) // Launch: 2%
    expect(e.collect).toBe(249_000)
    expect(e.fee).toBe(4_743) // 2% of ₹2,371.43 net
    expect(e.ifDelivered).toBeGreaterThan(0)
    expect(e.ifReturned).toBeLessThan(0) // a parcel that comes back costs shipping both ways, and ads
    expect(exampleOrder(100).ifDelivered).toBeGreaterThan(e.ifDelivered) // a lower fee keeps more
  })
})
