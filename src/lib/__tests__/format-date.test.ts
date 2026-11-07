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
