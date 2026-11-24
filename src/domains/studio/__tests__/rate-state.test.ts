// Admin's dollar-rate banner (V3b K2, mockup § 1 and call 2): the days the reserve's own rule allows (day >= today − 4).
import { describe, expect, it } from 'vitest'
import { rateState } from '../rate-state'

describe('rateState', () => {
  it('none, fresh, ageing from the third day with the last working day, the last day, then lapsed', () => {
    expect(rateState(null, '2026-11-24')).toEqual({ kind: 'none' })
    expect(rateState('2026-11-24', '2026-11-24')).toEqual({ kind: 'fresh' })
    expect(rateState('2026-11-22', '2026-11-24')).toEqual({ kind: 'fresh' })
    expect(rateState('2026-11-21', '2026-11-24')).toEqual({ kind: 'ageing', lastDay: '2026-11-25' })
    expect(rateState('2026-11-20', '2026-11-24')).toEqual({ kind: 'last' })
    expect(rateState('2026-11-19', '2026-11-24')).toEqual({ kind: 'lapsed', newest: '2026-11-19' })
  })
  it('across a month end', () => {
    expect(rateState('2026-11-28', '2026-12-01')).toEqual({ kind: 'ageing', lastDay: '2026-12-02' })
  })
})
