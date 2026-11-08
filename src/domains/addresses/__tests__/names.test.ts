import { describe, expect, it } from 'vitest'
import { movedUrl, oldNames, renamesLeft } from '../names'

const d = (s: string) => new Date(s)
describe('renamesLeft', () => {
  it('is unlimited before the first opening, then two less the count', () => {
    expect(renamesLeft(null, 5)).toBeNull()
    expect(renamesLeft(d('2026-11-01T00:00:00Z'), 0)).toBe(2)
    expect(renamesLeft(d('2026-11-01T00:00:00Z'), 1)).toBe(1)
    expect(renamesLeft(d('2026-11-01T00:00:00Z'), 3)).toBe(0)
  })
})
describe('movedUrl', () => {
  const loc = (pathname: string, search = '', hash = '', protocol = 'https:') => ({ protocol, pathname, search, hash })
  it('keeps path, query and fragment on the current address', () => {
    expect(movedUrl('kesar-two.frrata.shop', loc('/products/kurta', '?utm_source=instagram', '#reviews'))).toBe('https://kesar-two.frrata.shop/products/kurta?utm_source=instagram#reviews')
  })
  it('never leaves the current address, whatever the path', () => {
    for (const p of ['//evil.com', '//evil.com/x', '/\\evil.com', '/%2F%2Fevil.com']) {
      expect(new URL(movedUrl('kesar-two.frrata.shop', loc(p))!).hostname).toBe('kesar-two.frrata.shop')
    }
  })
  it('leaves order pages where their token was issued', () => {
    expect(movedUrl('kesar-two.frrata.shop', loc('/orders', '', '#t=abc'))).toBeNull()
    expect(movedUrl('kesar-two.frrata.shop', loc('/orders/x'))).toBeNull()
  })
  it('keeps http only on the local test stack', () => {
    expect(movedUrl('a.frata.test', loc('/', '', '', 'http:'))).toBe('http://a.frata.test/')
    expect(movedUrl('a.frrata.shop', loc('/', '', '', 'javascript:'))).toBe('https://a.frrata.shop/')
  })
})
describe('oldNames', () => {
  it('lists the shop\'s own old names, newest first, never Frrata\'s', () => {
    expect(oldNames([
      { name: 'first', retiredAt: d('2026-11-02T00:00:00Z'), retiredByFrrata: false },
      { name: 'copied', retiredAt: d('2026-11-04T00:00:00Z'), retiredByFrrata: true },
      { name: 'second', retiredAt: d('2026-11-03T00:00:00Z'), retiredByFrrata: false },
      { name: 'now', retiredAt: null, retiredByFrrata: false },
    ])).toEqual(['second', 'first'])
  })
})
