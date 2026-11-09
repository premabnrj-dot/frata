import { describe, expect, it } from 'vitest'
import { cleanGtin } from '../gtin'

describe('cleanGtin', () => {
  it('accepts EAN-13, UPC-A and GTIN-8 with a right check digit', () => {
    expect(cleanGtin('4006381333931')).toBe('4006381333931')
    expect(cleanGtin('400 6381-333931')).toBe('4006381333931')
    expect(cleanGtin('036000291452')).toBe('036000291452')
    expect(cleanGtin('96385074')).toBe('96385074')
  })
  it('refuses a wrong check digit, letters or a wrong length', () => {
    expect(cleanGtin('4006381333932')).toBeNull()
    expect(cleanGtin('40063813339A1')).toBeNull()
    expect(cleanGtin('12345')).toBeNull()
  })
})
