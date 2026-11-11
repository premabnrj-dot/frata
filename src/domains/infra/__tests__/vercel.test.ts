import { describe, expect, it } from 'vitest'
import { microUsd } from '@/domains/money/usd'
import { aggregateCharges, vercelAlerts, vercelFacts, type Charge, type UsageRow } from '../vercel'

const c = (day: string, service: string, cost: number, project = 'frata', q = 0, unit = ''): Charge =>
  ({ ChargePeriodStart: `${day}T08:00:00.000Z`, ServiceName: service, EffectiveCost: cost, ConsumedQuantity: q, ConsumedUnit: unit, Tags: { ProjectName: project } })

describe('aggregateCharges', () => {
  it('sums by day, project and service; drops empty rows and bad days', () => {
    const rows = aggregateCharges([
      c('2026-11-10', 'Fluid Active CPU', 0.01, 'frata', 0.07, 'Hours'), c('2026-11-10', 'Fluid Active CPU', 0.003, 'frata', 0.02, 'Hours'),
      c('2026-11-10', 'Fluid Active CPU', 0.02, 'ekatanv2', 0.14, 'Hours'), c('2026-11-10', 'Drains Volume', 0, 'frata', 0),
      { ...c('2026-11-10', 'Bad', 1), ChargePeriodStart: 'nope' },
    ])
    expect(rows).toHaveLength(2)
    const f = rows.find((r) => r.project === 'frata')!
    expect(f.costMicros).toBe(13_000)
    expect(f.quantity).toBeCloseTo(0.09)
  })
})

const day = (d: string, micros: number, project = 'frata', service = 'Fluid Active CPU', quantity = 0): UsageRow =>
  ({ day: d, project, service, quantity, unit: 'Hours', costMicros: micros as ReturnType<typeof microUsd> })

describe('vercelFacts and vercelAlerts', () => {
  const now = new Date('2026-11-11T12:00:00Z') // 10.5 days into a 30-day month
  it('month to date, pace and the split', () => {
    const f = vercelFacts([day('2026-10-31', 9e6), day('2026-11-01', 2e6), day('2026-11-05', 3e6, 'ekatanv2')], now)
    expect(f.usageMicros).toBe(5e6)
    expect(f.projectedMicros).toBe(Math.round(5e6 / 10.5 * 30))
    expect(f.onDemandMicros).toBe(0)
    expect(f.byProject[0]).toMatchObject({ project: 'ekatanv2', share: 0.6 })
    expect(vercelAlerts(f).map((a) => a.key)).toEqual(['vercel.project'])
  })
  it('on pace past the budget is soon; three quarters of it used is now', () => {
    const pace = vercelFacts([day('2026-11-02', 30e6)], now, 50)
    expect(vercelAlerts(pace).find((a) => a.key === 'vercel.pace')?.level).toBe('soon')
    const used = vercelFacts([day('2026-11-02', 60e6)], now, 50)
    expect(vercelAlerts(used).find((a) => a.key === 'vercel.budget')).toMatchObject({ level: 'now', title: '$40.00 of the $50.00 budget used' })
  })
  it('a finished day over 3× the week before is a spike; small days never are', () => {
    const rows = ['03', '04', '05', '06', '07', '08', '09'].map((d) => day(`2026-11-${d}`, 0.4e6)).concat([day('2026-11-10', 1.6e6), day('2026-11-11', 0.1e6)])
    const a = vercelAlerts(vercelFacts(rows, now, 1000)).find((x) => x.key === 'vercel.spike')
    expect(a).toMatchObject({ level: 'now', title: '2026-11-10: 4.0× a normal day' })
    const tiny = ['03', '04', '05', '06'].map((d) => day(`2026-11-${d}`, 0.01e6)).concat([day('2026-11-07', 0.2e6), day('2026-11-08', 0)])
    expect(vercelAlerts(vercelFacts(tiny, now, 1000)).find((x) => x.key === 'vercel.spike')).toBeUndefined()
  })
})
