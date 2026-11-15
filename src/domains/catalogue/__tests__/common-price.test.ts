import { describe, expect, it } from 'vitest'
import { commonPrice, targetsOf, targetsWords, unpriced } from '../common-price'

const rows = (xs: [string, string][]) => xs.map(([key, text]) => ({ key, label: key, text }))

describe('common price', () => {
  it('the price most share, in paise; a tie takes the lowest; none priced is null', () => {
    expect(commonPrice(['2,490', '2490', '2490.00', '2,890'])).toBe(249000)
    expect(commonPrice(['2,890', '2,490'])).toBe(249000)
    expect(commonPrice(['', '0', '14.'])).toBeNull()
  })
  it('unpriced: empty, 0 and unreadable text', () => {
    expect([unpriced(''), unpriced('0'), unpriced('14.'), unpriced('abc'), unpriced('2,490')]).toEqual([true, true, true, true, false])
  })
  it('targets: the common-priced and the unpriced; an own price is never one', () => {
    expect(targetsOf(rows([['XS', '2490'], ['M', '2,490'], ['XXL', '2890'], ['L', '']]))).toEqual(['XS', 'M', 'L'])
  })
  it('a cleared field never sweeps an own price: targets are taken once, before typing', () => {
    const r = rows([['XS', '2490'], ['M', '2490'], ['XXL', '2890']])
    const t = targetsOf(r)
    // While the field is cleared, the targets have no price; the targets were fixed before, so XXL is still out.
    const after = r.map((x) => (t.includes(x.key) ? { ...x, text: '' } : x))
    expect(targetsOf(after)).toEqual(['XS', 'M', 'XXL']) // what a fresh read would wrongly take…
    expect(t).toEqual(['XS', 'M']) // …and what the editor writes to
  })
  it('says who keeps an own price', () => {
    expect(targetsWords(rows([['XS', '2490'], ['M', '2490'], ['XXL', '2890']]))).toBe('Sets 2 of 3 · XXL has its own price')
    expect(targetsWords(rows([['XS', '2490'], ['M', '2490']]))).toBeNull()
  })
})
