import { describe, expect, it } from 'vitest'
import { applyBps, fromRupees, paise, sum } from '../paise'

describe('paise', () => {
  it('refuses a fraction of a paisa', () => {
    expect(() => paise(10.5)).toThrow()
  })
  it('turns typed rupees into paise without float drift', () => {
    expect(fromRupees(0.1 + 0.2)).toBe(30)
    expect(fromRupees(1499.5)).toBe(149950)
  })
  it('applies a rate in basis points', () => {
    expect(applyBps(paise(100000), 200)).toBe(2000) // 2% of ₹1,000
  })
  it('sums', () => {
    expect(sum([paise(1), paise(2)])).toBe(3)
  })
})
