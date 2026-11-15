import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { windowFor } from '@/domains/analytics/period'
import { shape } from '../analytics-series'

const now = new Date('2026-11-13T06:00:00Z') // Fri 13 Nov, 11:30 IST
const w = windowFor({ kind: 'preset', preset: '30' }, now)
const slotOf = (istIso: string) => Math.floor((Date.parse(istIso) + 19_800_000) / 10_800_000) // an IST wall time → its 3-hour slot
const ist = (s: string) => new Date(Date.parse(`${s}+05:30`)).toISOString()
const months: [Date, Date, Date, Date] = [new Date('2026-06-30T18:30:00Z'), new Date('2026-07-31T18:30:00Z'), new Date('2026-08-31T18:30:00Z'), new Date('2026-09-30T18:30:00Z')]

describe('series shape', () => {
  it('days, the comparison by day offset, the heat cell and paid/COD weeks', () => {
    const s = shape(w, [
      { slot: slotOf(ist('2026-11-08T21:15:00')), cur: true, kind: 'cod', rto: false, n: 3, sales: '300000' }, // Sun 8 Nov, 9 pm
      { slot: slotOf(ist('2026-11-08T21:15:00')), cur: true, kind: 'paid', rto: true, n: 1, sales: '100000' },
      { slot: slotOf(ist('2026-10-09T10:00:00')), cur: false, kind: 'cod', rto: false, n: 2, sales: '50000' }, // 30 days before 8 Nov
    ], [], [], [], months)
    const day = s.days.find((d) => d.key === '2026-11-08')!
    expect(day).toMatchObject({ orders: 4, sales: 400000, rto: 1, prevOrders: 2, prevSales: 50000 })
    expect(s.days).toHaveLength(30)
    expect(s.heat[6]![5]).toBe(4) // Sunday, 9–11 pm
    expect(s.weeks.map((x) => x.label)).toEqual(['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5 · 2 days'])
    expect(s.weeks.reduce((n, x) => n + x.a + x.b, 0)).toBe(4)
  })
  it('a short window goes by day', () => {
    const s = shape(windowFor({ kind: 'preset', preset: '7' }, now), [], [], [], [], months)
    expect(s.weeks).toHaveLength(7)
  })
  it('cohorts: oldest first, a month not begun yet is null, never 0', () => {
    const s = shape(w, [], [], [{ k: 0, shoppers: 310, m1: 99, m2: 65, m3: 46 }, { k: 3, shoppers: 455, m1: 160, m2: 0, m3: 0 }], [], months)
    expect(s.cohort.map((c) => [c.shoppers, c.again])).toEqual([[310, [99, 65, 46]], [0, [0, 0, 0]], [0, [0, 0, null]], [455, [160, null, null]]])
  })
})
