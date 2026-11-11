import { describe, expect, it } from 'vitest'
import { paise, type Paise } from '@/domains/money/paise'
import { deliveredFee } from '@/domains/plans/entitlements'
import { cheapestPlan, NUDGE_FLOOR, type LadderInvoice, type LadderPlan } from '../ladder'

// The three stores of the pricing ladder (frata-unit-economics) and its thresholds; plan figures as the plan versions hold them.
const launch: LadderPlan = { code: 'launch', name: 'Launch', monthlyPrice: paise(149_900), feeBps: 200 }
const growth: LadderPlan = { code: 'growth', name: 'Growth', monthlyPrice: paise(499_900), feeBps: 100 }
const scale: LadderPlan = { code: 'scale', name: 'Scale', monthlyPrice: paise(1_499_900), feeBps: 50 }
const others = [growth, scale]
const dec = new Date('2026-11-30T18:30:00Z'), nov = new Date('2026-10-31T18:30:00Z')
const rs = (n: number) => paise(Math.round(n * 100))

function invoice(id: string, at: Date, orders: number, aov: number, opts: { planPrice?: Paise; change?: boolean; credits?: number } = {}): LadderInvoice {
  const base = rs(aov), fee = deliveredFee(base, launch.feeBps)
  const fees = Array.from({ length: orders }, () => ({ base, fee }))
  const credits = Array.from({ length: opts.credits ?? 0 }, () => ({ base, fee }))
  const plan = opts.planPrice ?? launch.monthlyPrice
  const lines = [{ kind: 'plan', periodStart: at, taxable: plan }, { kind: 'fee', periodStart: nov, taxable: (fee * orders) as Paise }]
  if (opts.change) lines.push({ kind: 'change', periodStart: nov, taxable: rs(100) })
  return { id, periodStart: at, taxable: (plan + fee * orders - fee * credits.length) as Paise, lines, fees, credits }
}
const two = (orders: number, aov: number) => [invoice('dec', dec, orders, aov), invoice('nov', nov, orders, aov)]

describe('cheapestPlan', () => {
  it('a low-AOV shop (₹599 × 300) is right on Launch: no card', () => {
    expect(cheapestPlan(two(300, 599), launch, others)).toBeNull()
  })
  it('a high-AOV shop (₹4,500 × 80) saves ₹100 on Growth, under the floor: no card', () => {
    expect(cheapestPlan(two(80, 4500), launch, others)).toBeNull()
  })
  it('a volume shop (₹900 × 3,000) is told Scale, ₹27,000 less, never Growth (₹23,500)', () => {
    const n = cheapestPlan(two(3000, 900), launch, others)!
    expect(n.plan.code).toBe('scale')
    expect(n.saving).toBe(rs(27_000))
    expect(n.billed).toBe(rs(55_499))
    expect(n.would).toBe(rs(28_499))
    expect(n.invoiceId).toBe('dec')
  })
  it('₹3.5 L base is the break-even (no card); ₹4 L saves exactly the floor on Growth (a card)', () => {
    expect(cheapestPlan(two(350, 1000), launch, others)).toBeNull()
    const n = cheapestPlan(two(400, 1000), launch, others)!
    expect(n).toMatchObject({ plan: { code: 'growth' }, saving: NUDGE_FLOOR })
  })
  it('one month above and one below never triggers it (a festive month alone)', () => {
    expect(cheapestPlan([invoice('dec', dec, 3000, 900), invoice('nov', nov, 300, 599)], launch, others)).toBeNull()
    expect(cheapestPlan([invoice('dec', dec, 3000, 900)], launch, others)).toBeNull()
  })
  it('a custom price or a plan change on either invoice: no card', () => {
    expect(cheapestPlan([invoice('dec', dec, 3000, 900, { planPrice: rs(999) }), invoice('nov', nov, 3000, 900)], launch, others)).toBeNull()
    expect(cheapestPlan([invoice('dec', dec, 3000, 900), invoice('nov', nov, 3000, 900, { change: true })], launch, others)).toBeNull()
  })
  it('credits are restated at the other plan’s rate (the saving shrinks by what Launch credited over Scale)', () => {
    const n = cheapestPlan([invoice('dec', dec, 3000, 900, { credits: 100 }), invoice('nov', nov, 3000, 900)], launch, others)!
    // 100 credits of ₹18 on Launch against ₹4.50 on Scale: ₹1,350 less saving.
    expect(n.saving).toBe(rs(27_000 - 1_350))
  })
  it('rounds per order as the bill does', () => {
    const n = cheapestPlan(two(3000, 900.33), launch, others)!
    expect(n.saving).toBe((3000 * (deliveredFee(rs(900.33), 200) - deliveredFee(rs(900.33), 50)) + launch.monthlyPrice - scale.monthlyPrice) as Paise)
  })
  it('no fee rows: no card', () => {
    expect(cheapestPlan(two(0, 900), launch, others)).toBeNull()
  })
})
