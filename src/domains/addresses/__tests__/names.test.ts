import { describe, expect, it } from 'vitest'
import { oldNames, renamesLeft } from '../names'

const d = (s: string) => new Date(s)
describe('renamesLeft', () => {
  it('is unlimited before the first opening', () => expect(renamesLeft(null, [])).toBeNull())
  it('counts renames after the first opening, not before, and not Frrata\'s', () => {
    const opened = d('2026-11-01T00:00:00Z')
    expect(renamesLeft(opened, [{ name: 'a', retiredAt: d('2026-10-30T00:00:00Z'), retiredByFrrata: false }])).toBe(2)
    expect(renamesLeft(opened, [{ name: 'a', retiredAt: d('2026-11-02T00:00:00Z'), retiredByFrrata: false }])).toBe(1)
    expect(renamesLeft(opened, [{ name: 'a', retiredAt: d('2026-11-02T00:00:00Z'), retiredByFrrata: true }])).toBe(2)
    expect(renamesLeft(opened, [
      { name: 'a', retiredAt: d('2026-11-02T00:00:00Z'), retiredByFrrata: false },
      { name: 'b', retiredAt: d('2026-11-03T00:00:00Z'), retiredByFrrata: false },
      { name: 'c', retiredAt: null, retiredByFrrata: false },
    ])).toBe(0)
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
