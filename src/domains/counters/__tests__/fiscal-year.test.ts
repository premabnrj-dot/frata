import { describe, expect, it } from 'vitest'
import { fiscalYear } from '../fiscal-year'

describe('fiscalYear', () => {
  it('turns at midnight IST on 1 April, not UTC', () => {
    expect(fiscalYear(new Date('2027-03-31T18:29:59Z'))).toBe('26-27') // 31 Mar 23:59:59 IST
    expect(fiscalYear(new Date('2027-03-31T18:30:00Z'))).toBe('27-28') // 1 Apr 00:00 IST
  })
  it('handles the century turn', () => expect(fiscalYear(new Date('2099-06-01T00:00:00Z'))).toBe('99-00'))
})
