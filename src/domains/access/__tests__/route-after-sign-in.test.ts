import { describe, expect, it } from 'vitest'
import { routeAfterSignIn } from '../route-after-sign-in'

describe('routeAfterSignIn', () => {
  it('lets staff who also own a store choose', () => {
    expect(routeAfterSignIn({ isStaff: true, storeCount: 1 })).toBe('/choose')
  })
  it('sends staff without a store to Admin', () => {
    expect(routeAfterSignIn({ isStaff: true, storeCount: 0 })).toBe('/admin')
  })
  it('sends a merchant to the console', () => {
    expect(routeAfterSignIn({ isStaff: false, storeCount: 2 })).toBe('/console')
  })
  it('sends someone with no store to create one', () => {
    expect(routeAfterSignIn({ isStaff: false, storeCount: 0 })).toBe('/start')
  })
})
