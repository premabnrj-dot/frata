import { describe, expect, it } from 'vitest'
import { fillMode, readBagBy } from '../bag-fill'

describe('a bag link fills the bag (one-address plan P0)', () => {
  it('replaces a bag only links filled, even with no referrer (the pilot: its site is unknown to the store)', () => {
    expect(fillMode({ by: 'link', empty: false, fromSite: false })).toBe('replace')
  })
  it('joins a bag the shopper built on the store’s own pages, when the link comes from elsewhere', () => {
    expect(fillMode({ by: 'shop', empty: false, fromSite: false })).toBe('join')
  })
  it('replaces an empty bag', () => {
    expect(fillMode({ by: 'shop', empty: true, fromSite: false })).toBe('replace')
    expect(fillMode({ by: null, empty: true, fromSite: false })).toBe('replace')
  })
  it('replaces any bag when the link comes from the store’s own website', () => {
    expect(fillMode({ by: 'shop', empty: false, fromSite: true })).toBe('replace')
  })
  it('treats a bag from before the marker as the shopper’s own', () => {
    expect(fillMode({ by: null, empty: false, fromSite: false })).toBe('join')
  })
  it('reads only the two markers', () => {
    expect(readBagBy('link')).toBe('link')
    expect(readBagBy('shop')).toBe('shop')
    expect(readBagBy('keep')).toBeNull()
    expect(readBagBy(null)).toBeNull()
  })
})

describe('a link from the store’s own website', () => {
  it('matches the site’s host, www on either side, any case', async () => {
    const { fromSite } = await import('../bag-fill')
    expect(fromSite('https://www.houseofayuda.in/bag', 'https://houseofayuda.in')).toBe(true)
    expect(fromSite('https://HOUSEOFAYUDA.IN./', 'https://www.houseofayuda.in')).toBe(true)
    expect(fromSite('https://elsewhere.example/', 'https://houseofayuda.in')).toBe(false)
    expect(fromSite('', 'https://houseofayuda.in')).toBe(false)
    expect(fromSite('https://houseofayuda.in/', null)).toBe(false)
    expect(fromSite('not a url', 'https://houseofayuda.in')).toBe(false)
  })
})
