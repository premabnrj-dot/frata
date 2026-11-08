import { describe, expect, it } from 'vitest'

describe('the /partners calculator', () => {
  it('is shareExample() times the brands, a month and over the term', async () => {
    const { shareExample, shareTable } = await import('../example')
    const ex = shareExample({ name: 'Launch', monthlyPrice: 149_900, feeBps: 200 })
    const t = shareTable(ex, 24)
    expect(t.map((r) => r.brands)).toEqual([1, 3, 5, 10])
    expect(t[0]!.perMonth).toBe(ex.share)
    expect(t[2]!.perMonth).toBe(ex.share * 5)
    expect(t[3]!.overTerm).toBe(ex.share * 10 * 24)
  })
})
