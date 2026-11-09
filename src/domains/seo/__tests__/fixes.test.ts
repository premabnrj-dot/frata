import { describe, expect, it } from 'vitest'
import { seoFixes } from '../fixes'

describe('seoFixes (S·3)', () => {
  it('lists only what needs fixing, each linked to the first thing to fix', () => {
    const f = seoFixes({ photosNoAlt: { count: 6, firstHandle: 'linen-kurta' }, collectionsNoIntro: { count: 1, firstHandle: 'festive' }, sameTitle: { count: 0, firstHandle: null } })
    expect(f.map((x) => x.text)).toEqual(['6 photos without a description', '1 collection without an intro'])
    expect(f[0]!.href).toBe('/console/products/linen-kurta#photos')
  })
  it('nothing to fix is an empty list', () => {
    expect(seoFixes({ photosNoAlt: { count: 0, firstHandle: null }, collectionsNoIntro: { count: 0, firstHandle: null }, sameTitle: { count: 0, firstHandle: null } })).toEqual([])
  })
})
