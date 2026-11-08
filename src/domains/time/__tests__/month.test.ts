import { describe, expect, it } from 'vitest'
import { monthStartIST, nextMonthStartIST } from '../month'

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
