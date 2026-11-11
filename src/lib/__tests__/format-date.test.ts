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
