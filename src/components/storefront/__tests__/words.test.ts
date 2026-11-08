import { describe, expect, it } from 'vitest'
import { fill } from '../fill'
import { WORDS_FOR_TEST } from '../words'

// Both languages carry every word, with the same {placeholders}: a Hindi shop never shows a blank or an English gap.
const flat = (o: object, at = ''): Record<string, string> =>
  Object.fromEntries(Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [[at + k, v]] : Object.entries(flat(v as object, `${at}${k}.`)))))
const holes = (t: string) => [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join()

describe('shop words', () => {
  it.each([['page words', WORDS_FOR_TEST.EN, WORDS_FOR_TEST.HI], ['buy box words', WORDS_FOR_TEST.BUY_EN, WORDS_FOR_TEST.BUY_HI]] as const)('%s: same keys, same placeholders, none empty', (_n, en, hi) => {
    const e = flat(en), h = flat(hi)
    expect(Object.keys(h).sort()).toEqual(Object.keys(e).sort())
    for (const k of Object.keys(e)) { expect(holes(h[k]!), k).toBe(holes(e[k]!)); expect(h[k]!.trim(), k).not.toBe('') }
  })
  it('fill puts values in and leaves an unknown name visible', () => {
    expect(fill('Ships in {d} {days}', { d: 2, days: 'days' })).toBe('Ships in 2 days')
    expect(fill('{x} and {y}', { x: 1 })).toBe('1 and {y}')
  })
})

describe('the buy box says what availability() says, for an English shop', () => {
  it('each kind', async () => {
    const { availability } = await import('@/domains/catalogue/availability')
    const { BUY_EN } = WORDS_FOR_TEST
    const now = new Date('2026-11-08T10:00:00+05:30')
    const base = { stock: 0, whenOut: 'stop' as const, shipsBy: null, leadMinDays: null, leadMaxDays: null, preorderCap: null }
    expect(availability({ ...base, stock: 50 }, now).label).toBe(BUY_EN.inStock)
    expect(availability({ ...base, stock: 2 }, now).label).toBe(fill(BUY_EN.lowStock, { n: 2 }))
    expect(availability(base, now).label).toBe(BUY_EN.soldOut)
    expect(availability({ ...base, whenOut: 'made_to_order', leadMinDays: 5, leadMaxDays: 9 }, now).label).toBe(fill(BUY_EN.madeToOrder, { a: 5, b: 9 }))
    expect(availability({ ...base, whenOut: 'preorder', shipsBy: '2026-12-12' }, now).label).toBe(fill(BUY_EN.preorderBy, { date: '12 Dec' }))
  })
})
