import { describe, expect, it } from 'vitest'
import { istDayKey, istDayStart, istLastDays } from '../day'

describe('IST days', () => {
  it('the day turns at 18:30 UTC', () => {
    expect(istDayKey(new Date('2026-11-06T18:29:59.999Z'))).toBe('2026-11-06')
    expect(istDayKey(new Date('2026-11-06T18:30:00.000Z'))).toBe('2026-11-07')
  })
  it('a day starts at IST midnight, offset back and across a month', () => {
    const now = new Date('2026-11-07T10:00:00Z') // 3:30 pm IST
    expect(istDayStart(now).toISOString()).toBe('2026-11-06T18:30:00.000Z')
    expect(istDayStart(now, -6).toISOString()).toBe('2026-10-31T18:30:00.000Z')
    expect(istDayStart(new Date('2026-11-06T18:30:00Z')).toISOString()).toBe('2026-11-06T18:30:00.000Z')
  })
  it('the last 7 days end today, oldest first', () => {
    expect(istLastDays(new Date('2026-11-06T19:00:00Z'), 7)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07'])
  })
})
