import { describe, expect, it } from 'vitest'
import { addMonths, monthStartIST, nextMonthStartIST } from '../month'

describe('monthStartIST', () => {
  it('is midnight IST on the 1st, i.e. 18:30 UTC the day before', () => {
    expect(monthStartIST(new Date('2026-11-06T10:00:00Z')).toISOString()).toBe('2026-10-31T18:30:00.000Z')
  })
  it('counts a moment just after IST midnight on the 1st as the new month', () => {
    expect(monthStartIST(new Date('2026-11-30T18:31:00Z')).toISOString()).toBe('2026-11-30T18:30:00.000Z')
  })
  it('rolls December into January', () => {
    expect(nextMonthStartIST(new Date('2026-12-15T00:00:00Z')).toISOString()).toBe('2026-12-31T18:30:00.000Z')
  })
})

describe('monthOfYM / ymOf', () => {
  it('round-trips an IST month', async () => {
    const { monthOfYM, ymOf } = await import('../month')
    expect(monthOfYM('2026-12')!.toISOString()).toBe('2026-11-30T18:30:00.000Z')
    expect(ymOf(monthOfYM('2026-12')!)).toBe('2026-12')
    expect(monthOfYM('2026-13')).toBeNull()
  })
})

describe('addMonths', () => {
  it('a day past the month end falls to its last day, and each date derives from the first', () => {
    const d = new Date('2027-01-31T00:00:00Z')
    expect(addMonths(d, 1).toISOString()).toBe('2027-02-28T00:00:00.000Z')
    expect(addMonths(d, 2).toISOString()).toBe('2027-03-31T00:00:00.000Z')
  })
  it('keeps the time of day and the milliseconds, and goes back for a negative n', () => {
    expect(addMonths(new Date('2026-11-23T10:20:30.456Z'), 3).toISOString()).toBe('2027-02-23T10:20:30.456Z')
    expect(addMonths(new Date('2026-11-23T00:00:00Z'), -13).toISOString()).toBe('2025-10-23T00:00:00.000Z')
  })
})
