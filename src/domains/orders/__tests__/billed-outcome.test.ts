import { describe, expect, it } from 'vitest'
import { ASSUME_DELIVERED_DAYS, billedOutcome } from '../outcomes'

const at = (d: string) => new Date(d)
const o = (x: Partial<{ shippedAt: Date; deliveredAt: Date; rtoInitiatedAt: Date; lostAt: Date }>) => ({ shippedAt: null, deliveredAt: null, rtoInitiatedAt: null, lostAt: null, ...x })

describe('billedOutcome', () => {
  it('ranks as billableAt does: a return outranks delivered, delivered outranks lost', () => {
    expect(billedOutcome(o({ shippedAt: at('2026-11-01'), deliveredAt: at('2026-11-03'), rtoInitiatedAt: at('2026-11-05') })).outcome).toBe('came_back')
    expect(billedOutcome(o({ shippedAt: at('2026-11-01'), deliveredAt: at('2026-11-03'), lostAt: at('2026-11-04') })).outcome).toBe('delivered')
    expect(billedOutcome(o({ shippedAt: at('2026-11-01'), lostAt: at('2026-11-04') }))).toEqual({ outcome: 'lost', outcomeAt: at('2026-11-04') })
  })
  it('shipped with no outcome counts as delivered from day 30', () => {
    const r = billedOutcome(o({ shippedAt: at('2026-10-01T00:00:00Z') }))
    expect(r.outcome).toBe('assumed')
    expect(r.outcomeAt?.getTime()).toBe(at('2026-10-01T00:00:00Z').getTime() + ASSUME_DELIVERED_DAYS * 86_400_000)
  })
})
