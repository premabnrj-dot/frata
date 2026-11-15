import { describe, expect, it } from 'vitest'
import { ALL_STATES, bucketOf, busiest, change, levels, splitWords, STATE_TILES, ticks } from '../kit'

describe('change: coloured by meaning, not direction', () => {
  it('counts and money in percent', () => {
    expect(change(112, 100, { kind: 'money', good: 'up' })).toEqual({ arrow: '↑', words: '↑ 12%', tone: 'good' })
    expect(change(91, 100, { kind: 'count', good: 'up' })).toEqual({ arrow: '↓', words: '↓ 9%', tone: 'bad' })
    expect(change(5, 0, { kind: 'count', good: 'up' })).toEqual({ arrow: '', words: '—', tone: 'none' })
    expect(change(100, 100, { kind: 'count', good: 'up' }).words).toBe('No change')
  })
  it('a share in points; returns going up is worse', () => {
    expect(change(0.142, 0.121, { kind: 'share', good: 'down' })).toEqual({ arrow: '↑', words: '↑ 2.1 points — worse', tone: 'bad' })
    expect(change(0.10, 0.12, { kind: 'share', good: 'down' })).toEqual({ arrow: '↓', words: '↓ 2.0 points', tone: 'good' })
  })
})

describe('the rest', () => {
  it('ticks read well and reach the top', () => {
    expect(ticks(82_000)).toEqual([30_000, 60_000, 90_000])
    expect(ticks(14)).toEqual([5, 10, 15])
  })
  it('levels: zero stays lightest, the top is darkest', () => expect(levels([0, 10, 50, 100], 6)).toEqual([0, 1, 3, 5]))
  it('hours fall in their bucket; the busiest in words', () => {
    expect([bucketOf(2), bucketOf(6), bucketOf(13), bucketOf(22), bucketOf(23)]).toEqual([6, 0, 2, 5, 5])
    const g = Array.from({ length: 7 }, () => Array(7).fill(1)); g[6]![5] = 9
    expect(busiest(g)).toBe('Sundays, 9–11 pm')
    expect(busiest([[0]])).toBe(null)
  })
  it('split in words', () => {
    expect(splitWords([{ a: 34, b: 66 }, { a: 1, b: 1 }, { a: 47, b: 53 }])).toBe('Paid online went from 34% to 47% of orders.')
    expect(splitWords([{ a: 1, b: 1 }])).toBe(null)
  })
  it('every state has a tile, no two share a cell', () => {
    expect(Object.keys(STATE_TILES).sort()).toEqual([...ALL_STATES].sort())
    const cells = Object.values(STATE_TILES).map((t) => `${t.row}:${t.col}`)
    expect(new Set(cells).size).toBe(cells.length)
  })
})
