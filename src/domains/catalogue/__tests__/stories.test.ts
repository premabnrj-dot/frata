import { describe, expect, it } from 'vitest'
import { cleanPairIds, cleanStories, pairAction } from '../stories'

const img = { base: 'https://h/tenants/t/products/x', widths: [400], width: 4, height: 5, alt: '', decorative: false }
const SELF = '11111111-1111-4111-8111-111111111111', A = '22222222-2222-4222-8222-222222222222', B = '33333333-3333-4333-8333-333333333333'

describe('cleanStories', () => {
  it('keeps up to six, trims, drops empty stories and empty notes', () => {
    const r = cleanStories([{ title: '  Roam  ', notes: [' One ', ''] }, { title: '', text: '' }, { image: img }])
    expect(r).toEqual({ ok: true, stories: [{ image: null, title: 'Roam', text: '', notes: ['One'] }, { image: { ...img }, title: '', text: '', notes: [] }] })
  })
  it('refuses a seventh story, a fourth note, and over-long text', () => {
    expect(cleanStories(Array.from({ length: 7 }, () => ({ title: 'x' }))).ok).toBe(false)
    expect(cleanStories([{ notes: ['a', 'b', 'c', 'd'] }]).ok).toBe(false)
    expect(cleanStories([{ text: 'x'.repeat(301) }]).ok).toBe(false)
  })
  it('the largest valid stories in Hindi fit the database backstop (16 kB)', () => {
    const hi = (n: number) => 'क'.repeat(n)
    const r = cleanStories(Array.from({ length: 6 }, () => ({ image: { ...img, alt: hi(160) }, title: hi(60), text: hi(300), notes: [hi(60), hi(60), hi(60)] })))
    expect(r.ok).toBe(true)
    if (r.ok) expect(new TextEncoder().encode(JSON.stringify(r.stories)).length).toBeLessThan(16384)
  })
})

describe('cleanPairIds', () => {
  it('uuids only, once each, never itself, at most two', () => {
    expect(cleanPairIds([A, A, SELF, 'nope', B, '44444444-4444-4444-8444-444444444444'], SELF)).toEqual([A, B])
    expect(cleanPairIds('x', SELF)).toEqual([])
  })
})

describe('cleanPairIds, any case', () => {
  it('drops an upper-case copy of the product itself and duplicates in another case', () => {
    expect(cleanPairIds([SELF.toUpperCase(), A, A.toUpperCase()], SELF)).toEqual([A])
  })
})

describe('pairAction', () => {
  it('Add only for a piece with no options and one buyable variant; a sized piece is chosen on its page', () => {
    expect(pairAction({ options: [], buyableVariants: 1 })).toBe('add')
    expect(pairAction({ options: ['Size'], buyableVariants: 1 })).toBe('choose')
    expect(pairAction({ options: [], buyableVariants: 0 })).toBe('choose')
  })
})
