import { describe, expect, it } from 'vitest'
import { todayLongIN, waitedIN, weekdayShortIN } from '../format-date'

describe('format-date (U·4 words)', () => {
  const now = new Date('2026-11-07T10:00:00Z')
  it('a wait, as a count says it', () => {
    expect(waitedIN(new Date(now.getTime() - 20_000), now)).toBe('just now')
    expect(waitedIN(new Date(now.getTime() - 25 * 60_000), now)).toBe('25 min')
    expect(waitedIN(new Date(now.getTime() - 3.5 * 3600_000), now)).toBe('3 h')
    expect(waitedIN(new Date(now.getTime() - 50 * 3600_000), now)).toBe('2 d')
  })
  it('weekday and today in IST, whatever the server clock', () => {
    expect(weekdayShortIN('2026-11-07')).toBe('Sat')
    expect(todayLongIN(new Date('2026-11-06T19:00:00Z'))).toMatch(/^Saturday,? 7 November$/)
  })
})

describe('dropLineIN (Theme Studio TS1b)', () => {
  it('says a drop in India time, minutes only when not on the hour', async () => {
    const { dropLineIN } = await import('../format-date')
    expect(dropLineIN(new Date('2026-11-14T13:30:00Z'))).toBe('Sat 14 Nov, 7 pm')
    expect(dropLineIN(new Date('2026-11-14T07:00:00Z'))).toBe('Sat 14 Nov, 12:30 pm')
  })
})

describe('momentIN (Neel N3: a moment in a list)', () => {
  it('Today and Yesterday by the IST calendar, then the day, the year only when not this year', async () => {
    const { momentIN } = await import('../format-date')
    const now = new Date('2026-11-15T18:00:00Z') // 11:30 pm IST on 15 Nov
    expect(momentIN(new Date('2026-11-15T04:36:00Z'), now)).toBe('Today, 10:06 am')
    expect(momentIN(new Date('2026-11-14T20:06:00Z'), now)).toBe('Yesterday, 1:36 am'.replace('Yesterday', 'Today'))
    expect(momentIN(new Date('2026-11-14T16:36:00Z'), now)).toBe('Yesterday, 10:06 pm')
    expect(momentIN(new Date('2026-11-13T16:36:00Z'), now)).toBe('13 Nov, 10:06 pm')
    expect(momentIN(new Date('2025-11-13T16:36:00Z'), now)).toBe('13 Nov 2025, 10:06 pm')
  })
  it('across IST midnight while the server clock is still on the day before (UTC)', async () => {
    const { momentIN } = await import('../format-date')
    const now = new Date('2026-11-15T19:00:00Z') // 12:30 am IST on 16 Nov; UTC still says 15 Nov
    expect(momentIN(new Date('2026-11-15T18:45:00Z'), now)).toBe('Today, 12:15 am')
    expect(momentIN(new Date('2026-11-15T16:36:00Z'), now)).toBe('Yesterday, 10:06 pm')
    expect(momentIN('2026-11-14T16:36:00Z', now)).toBe('15 Nov, 10:06 pm'.replace('15', '14'))
  })
})
