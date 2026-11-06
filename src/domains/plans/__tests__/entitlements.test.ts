import { describe, expect, it } from 'vitest'
import { fromRupees, paise } from '@/domains/money/paise'
import { canUse, currentPlan, deliveredFee, monthlyPrice, nextPlan, usage, type PlanVersion } from '../entitlements'

const growth: PlanVersion = { planCode: 'growth', version: 1, monthlyPrice: fromRupees(4999), includedOrders: 1500, feeBps: 100 }
const d = (s: string) => new Date(s)

describe('entitlements', () => {
  it('takes the latest plan that has started, ignoring scheduled ones', () => {
    const rows = [{ startsAt: d('2026-11-01'), id: 'a' }, { startsAt: d('2026-11-05'), id: 'b' }, { startsAt: d('2026-12-01'), id: 'c' }]
    expect(currentPlan(rows, d('2026-11-06'))?.id).toBe('b')
    expect(currentPlan(rows, d('2026-10-01'))).toBeNull()
  })
  it('answers features from the plan', () => {
    expect(canUse(['rto_shield'], 'rto_shield')).toBe(true)
    expect(canUse([], 'size_fit')).toBe(false)
  })
  it('charges 1% of a delivered ₹1,200 order on Growth', () => {
    expect(deliveredFee(fromRupees(1200), growth.feeBps)).toBe(fromRupees(12))
  })
  it('charges 0.5% on Scale, rounded to the paisa', () => {
    expect(deliveredFee(paise(99_999), 50)).toBe(500)
  })
  it('is free during a trial, then the custom price if any, else the version price', () => {
    const row = { planVersion: growth, customMonthlyPrice: null, trialEndsAt: d('2026-11-20') }
    expect(monthlyPrice(row, d('2026-11-10'))).toBe(0)
    expect(monthlyPrice(row, d('2026-11-21'))).toBe(fromRupees(4999))
    expect(monthlyPrice({ ...row, trialEndsAt: null, customMonthlyPrice: fromRupees(3999) }, d('2026-11-10'))).toBe(fromRupees(3999))
  })
  it('flags usage past the included orders without stopping', () => {
    expect(usage(1600, 1500)).toEqual({ used: 1600, included: 1500, over: true })
  })
  it('suggests the next plan up', () => {
    expect(nextPlan('launch')).toBe('growth')
    expect(nextPlan('scale')).toBeNull()
  })
})
