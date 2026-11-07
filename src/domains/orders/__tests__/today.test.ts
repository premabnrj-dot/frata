import { describe, expect, it } from 'vitest'
import { toConfirmLine, waitLine, weekBars } from '../today'

const t = new Date('2026-11-07T04:00:00Z')

describe('Home tile lines', () => {
  it('a count that could not be read is never a 0; a risk that could not be read is never "0 high risk"', () => {
    expect(toConfirmLine(null, 3, t)).toEqual({ kind: 'uncounted' })
    expect(toConfirmLine(null, null, null)).toEqual({ kind: 'uncounted' })
    expect(waitLine(null, t)).toEqual({ kind: 'uncounted' })
    expect(toConfirmLine(6, null, t)).toEqual({ kind: 'risk_unavailable', since: t })
  })
  it('zero says so; high risk outranks the oldest wait', () => {
    expect(toConfirmLine(0, 0, null)).toEqual({ kind: 'none' })
    expect(toConfirmLine(0, null, null)).toEqual({ kind: 'none' })
    expect(waitLine(0, null)).toEqual({ kind: 'none' })
    expect(toConfirmLine(6, 1, t)).toEqual({ kind: 'high', high: 1, since: t })
    expect(toConfirmLine(6, 0, t)).toEqual({ kind: 'oldest', since: t })
    expect(waitLine(3, t)).toEqual({ kind: 'oldest', since: t })
  })
})

describe('weekBars', () => {
  const now = new Date('2026-11-07T10:00:00Z')
  it('seven IST days, zero-filled, by order count, today marked', () => {
    const b = weekBars([{ day: '2026-11-04', orders: 8, value: 100 }, { day: '2026-11-07', orders: 2, value: 50 }, { day: '2026-10-20', orders: 99, value: 1 }], now)
    expect(b.map((x) => x.day)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07'])
    expect(b.map((x) => x.share)).toEqual([0, 0, 0, 1, 0, 0, 0.25]) // a day outside the week is ignored
    expect(b.filter((x) => x.today).map((x) => x.day)).toEqual(['2026-11-07'])
  })
  it('an empty week has no bars to scale', () => {
    expect(weekBars([], now).every((x) => x.share === 0 && x.orders === 0)).toBe(true)
  })
})
