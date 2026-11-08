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
