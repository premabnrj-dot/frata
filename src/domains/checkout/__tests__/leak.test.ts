import { describe, expect, it } from 'vitest'
import { leakOf } from '../leak'

const w = (last7: number, viaLink7: number, prev28 = 0, prevDays = 28) => ({ last7, viaLink7, prev28, prevDays })

describe('leakOf', () => {
  it('says nothing under 10 uses in the week, however they arrived', () => {
    expect(leakOf(w(9, 0, 0))).toBeNull()
  })
  it('flags a code mostly typed: under half by link', () => {
    const l = leakOf(w(10, 4, 40))
    expect(l?.reasons).toEqual(['typed'])
    expect(l?.text).toMatch(/^Leak\? 6 of its 10 uses this week were typed/)
    expect(l?.text).toMatch(/end the offer/)
  })
  it('exactly half by link is not a leak', () => {
    expect(leakOf(w(10, 5, 40))).toBeNull()
  })
  it('flags a week over 3x the usual (28 days: usual week = prev28 / 4)', () => {
    expect(leakOf(w(31, 31, 40))?.reasons).toEqual(['spike']) // usual 10 a week, 31 > 30
    expect(leakOf(w(30, 30, 40))).toBeNull() // exactly 3x is not more than
  })
  it('says both when both hold', () => {
    const l = leakOf(w(40, 2, 8))
    expect(l?.reasons).toEqual(['typed', 'spike'])
    expect(l?.text).toMatch(/typed.*; and this week ran at more than 3 times/)
  })
  it('a younger code is judged on its own days; under a week before this one, no usual week', () => {
    expect(leakOf(w(12, 12, 2, 14))?.reasons).toEqual(['spike']) // usual 1 a week
    expect(leakOf(w(12, 12, 0, 6))).toBeNull()
    expect(leakOf(w(12, 12, 0, 0))).toBeNull()
  })
})
