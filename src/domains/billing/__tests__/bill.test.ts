// Billing B0: computeBill reproduces the unit-economics review's worked months to the paisa (2026-11-08).
import { describe, expect, it } from 'vitest'
import { computeBill, returnCreditDue, planChangeAdds, planChangeOwed, type BillInput, type PlanRow } from '../bill'
import { billableAt, billableDelivered } from '@/domains/orders/outcomes'
import { feeForOrder } from '@/domains/plans/entitlements'
import { paise } from '@/domains/money/paise'

const ist = (y: number, m: number, d = 1) => new Date(Date.UTC(y, m - 1, d) - 330 * 60_000)
const launch: PlanRow = { startsAt: ist(2026, 11), planVersion: { planCode: 'launch', name: 'Launch', monthlyPrice: paise(149900), includedOrders: 150, feeBps: 200 }, trialEndsAt: null, customMonthlyPrice: null }
const growth: PlanRow = { ...launch, planVersion: { planCode: 'growth', name: 'Growth', monthlyPrice: paise(499900), includedOrders: 1500, feeBps: 100 } }
const orders = (n: number, net: number, at: Date) => Array.from({ length: n }, (_, k) => ({ orderId: `o${k}`, number: `KS-${1000 + k}`, billableAt: at, rateAt: at, merchandiseNet: net }))
const base = (m: number, over: Partial<BillInput>): BillInput => ({ monthStart: ist(2026, m), nextMonthStart: ist(2026, m + 1), prevMonthStart: ist(2026, m - 1), plans: [launch], addons: [], feeOrders: [], credits: [], carry: 0, rolledLastMonth: false, frrataGstin: '08AAACF0000A1Z5', shopState: '08', ...over })

describe('computeBill (billing B0, golden months)', () => {
  it('Launch, same state: the first invoice is the plan in advance', () => {
    const b = computeBill(base(11, {}))
    expect([b.taxable, b.cgst, b.sgst, b.igst, b.total]).toEqual([149900, 13491, 13491, 0, 176882])
  })
  it('Launch, December: plan + 113 delivered orders at ₹857.14, the fee rounded per order', () => {
    const b = computeBill(base(12, { feeOrders: orders(113, 85714, ist(2026, 11, 15)) }))
    expect(b.fees[0]!.fee).toBe(1714)
    expect(b.lines.find((l) => l.kind === 'fee')!.taxable).toBe(193682)
    expect([b.taxable, b.cgst, b.sgst, b.total]).toEqual([343582, 30922, 30922, 405426])
    expect(b.usage).toEqual({ orders: 113, included: 150, over: false })
  })
  it('Launch, January: two late returns credited exactly what they were billed', () => {
    const credits = [{ orderId: 'o1', number: 'KS-1001', fee: paise(1714), invoiceNumber: 'FRR/26-27/000002' }, { orderId: 'o2', number: 'KS-1002', fee: paise(1714), invoiceNumber: 'FRR/26-27/000002' }]
    const b = computeBill(base(1, { monthStart: ist(2027, 1), nextMonthStart: ist(2027, 2), prevMonthStart: ist(2026, 12), feeOrders: orders(113, 85714, ist(2026, 12, 10)), credits }))
    expect([b.taxable, b.cgst, b.total]).toEqual([340154, 30614, 401382])
    expect(b.credited).toHaveLength(2)
  })
  it('Growth, another state: IGST on the taxable value; 1,600 orders are over the plan as a ₹0 line', () => {
    const a = computeBill(base(12, { plans: [{ ...growth }], feeOrders: orders(1200, 114286, ist(2026, 11, 20)), shopState: '27' }))
    expect([a.taxable, a.igst, a.total, a.cgst]).toEqual([1871500, 336870, 2208370, 0])
    const b = computeBill(base(12, { plans: [{ ...growth }], feeOrders: orders(1600, 114286, ist(2026, 11, 20)), shopState: '27' }))
    expect(b.lines.find((l) => l.kind === 'over')).toMatchObject({ quantity: 100, taxable: 0 })
  })
  it('a trial month: free for its days; a small bill rolls once, then invoices', () => {
    // Trials A2: a trial running on 1 Nov bills no plan on November's invoice; December's makes up 16–30 Nov by days.
    const trial = { ...launch, trialEndsAt: ist(2026, 11, 16) }
    expect(computeBill(base(11, { plans: [trial] })).lines.some((l) => l.kind === 'plan' || l.kind === 'change')).toBe(false)
    const dec = computeBill(base(12, { plans: [trial], prevPlanBilled: 0 }))
    expect(dec.lines.find((l) => l.kind === 'change')).toMatchObject({ taxable: Math.round(149900 * 15 / 30), description: 'Your plan after the trial last month, by days' })
    expect(dec.lines.find((l) => l.kind === 'plan')!.taxable).toBe(149900) // December in advance, the trial over
    // No November invoice at all (a shop that signed up in November): still made up.
    expect(computeBill(base(12, { plans: [trial], prevPlanBilled: null })).lines.find((l) => l.kind === 'change')!.taxable).toBe(Math.round(149900 * 15 / 30))
    const tiny = computeBill(base(12, { plans: [{ ...launch, trialEndsAt: ist(2027, 1) }], feeOrders: orders(5, 85714, ist(2026, 11, 20)) }))
    expect([tiny.rolled, tiny.taxable, tiny.total]).toEqual([true, 8570, 0])
    const again = computeBill(base(12, { plans: [{ ...launch, trialEndsAt: ist(2027, 1) }], feeOrders: orders(5, 85714, ist(2026, 11, 20)), rolledLastMonth: true }))
    expect(again.rolled).toBe(false)
  })
  it('a plan starting mid-month, an add-on by its days, and a rolled bill carried in', () => {
    // Growth from 16 December (Launch before it): each by its days of 31.
    const b = computeBill(base(12, { plans: [launch, { ...growth, startsAt: ist(2026, 12, 16) }] }))
    expect(b.lines.filter((l) => l.kind === 'plan').map((l) => l.taxable)).toEqual([Math.round(149900 * 15 / 31), Math.round(499900 * 16 / 31)])
    // An add-on from 11 December: nothing on December's invoice (made before it began), then January's makes up its
    // 21 days of 31 and bills January in advance (A3 Arch B1).
    const row = { module: 'size_fit', name: 'Size and fit', monthlyPrice: paise(99900), startsAt: ist(2026, 12, 11), endsAt: null, trialEndsAt: null }
    expect(computeBill(base(12, { addons: [row] })).lines.filter((l) => l.kind === 'addon')).toEqual([])
    const jan = computeBill({ ...base(12, { addons: [row] }), monthStart: ist(2027, 1), nextMonthStart: ist(2027, 2), prevMonthStart: ist(2026, 12) })
    expect(jan.lines.filter((l) => l.kind === 'addon').map((l) => [l.description, l.taxable])).toEqual([['Size and fit, last month by days', Math.round(99900 * 21 / 31)], ['Size and fit', 99900]])
    const c = computeBill(base(12, { carry: 8570, rolledLastMonth: true }))
    expect(c.lines.find((l) => l.kind === 'carry')!.taxable).toBe(8570)
    expect(c.taxable).toBe(149900 + 8570)
  })
  it('add-ons: in force on the 1st in advance; ended mid-month stops; a self-serve trial’s paid row from its end', () => {
    const r = (o: object) => ({ module: 'delivery_zones', name: 'Delivery Zones', monthlyPrice: paise(99900), startsAt: ist(2026, 10, 1), endsAt: null, trialEndsAt: null, ...o })
    const lines = (b: ReturnType<typeof computeBill>) => b.lines.filter((l) => l.kind === 'addon').map((l) => l.taxable)
    expect(lines(computeBill(base(12, { addons: [r({})] })))).toEqual([99900])
    expect(lines(computeBill(base(12, { addons: [r({ endsAt: ist(2026, 12, 11) })] })))).toEqual([Math.round(99900 * 10 / 31)])
    // A trial from 20 Nov to 4 Dec: its paid row starts 4 Dec. December's invoice (1 Dec, the trial running): nothing.
    const paid = r({ startsAt: ist(2026, 12, 4) })
    const trial = r({ monthlyPrice: paise(0), startsAt: ist(2026, 11, 20), endsAt: ist(2026, 12, 4), trialEndsAt: ist(2026, 12, 4) })
    expect(lines(computeBill(base(12, { addons: [trial, paid] })))).toEqual([])
    const jan = computeBill({ ...base(12, { addons: [trial, paid] }), monthStart: ist(2027, 1), nextMonthStart: ist(2027, 2), prevMonthStart: ist(2026, 12) })
    expect(lines(jan)).toEqual([Math.round(99900 * 28 / 31), 99900])
    // Ended during the trial: nothing, ever.
    const ended = r({ startsAt: ist(2026, 12, 4), endsAt: ist(2026, 11, 25) })
    expect(lines(computeBill({ ...base(12, { addons: [ended] }), monthStart: ist(2027, 1), nextMonthStart: ist(2027, 2), prevMonthStart: ist(2026, 12) }))).toEqual([])
  })
  it('a negative month carries forward and is never refunded', () => {
    const b = computeBill(base(12, { plans: [{ ...launch, trialEndsAt: ist(2027, 1) }], credits: [{ orderId: 'x', number: 'KS-1', fee: paise(5000), invoiceNumber: null }] }))
    expect([b.total, b.carryOut]).toEqual([0, -5000])
  })
  it('a returned item is not billable (owner, 2026-11-12): returns after billing give back the fee on what came back', () => {
    // Billed 2% of ₹2,000 = ₹40; ₹500 of it came back: the fee on ₹1,500 is ₹30, so ₹10 comes back, once.
    expect(returnCreditDue({ billedFee: 4000, feeBps: 200, merchandiseNet: 200000, returned: 50000, given: 0 })).toBe(1000)
    expect(returnCreditDue({ billedFee: 4000, feeBps: 200, merchandiseNet: 200000, returned: 50000, given: 1000 })).toBe(0)
    // A second return later: the rest of what came back.
    expect(returnCreditDue({ billedFee: 4000, feeBps: 200, merchandiseNet: 200000, returned: 150000, given: 1000 })).toBe(2000)
    // Everything back: the whole fee, never more.
    expect(returnCreditDue({ billedFee: 4000, feeBps: 200, merchandiseNet: 200000, returned: 250000, given: 0 })).toBe(4000)
    const b = computeBill(base(12, { returnCredits: [{ orderId: 'y', number: '#7', fee: paise(1000), invoiceNumber: 'FR/26-27/12' }, { orderId: 'z', number: '#8', fee: paise(0), invoiceNumber: null }] }))
    expect(b.lines.filter((l) => l.kind === 'credit')).toEqual([expect.objectContaining({ description: '#7: items returned after billing (invoice FR/26-27/12)', taxable: -1000 })])
    expect(b.credited).toEqual([{ orderId: 'y', fee: 1000, kind: 'return' }])
  })
  it('the fee follows the plan in force when the order became billable', () => {
    const history = [launch, { ...growth, startsAt: ist(2026, 11, 20) }]
    expect(feeForOrder(history, { merchandiseNet: 100000, rateAt: ist(2026, 11, 19), billableAt: ist(2026, 11, 19) })!.feeBps).toBe(200)
    expect(feeForOrder(history, { merchandiseNet: 100000, rateAt: ist(2026, 11, 21), billableAt: ist(2026, 11, 21) })!.feeBps).toBe(100)
  })
})

describe('billableAt (the one billable rule)', () => {
  const d = (n: number) => new Date(Date.UTC(2026, 10, n))
  const o = { shippedAt: d(1), deliveredAt: null as Date | null, rtoInitiatedAt: null as Date | null, lostAt: null as Date | null }
  it('delivered, or 30 days shipped, whichever is first; never after a return or a loss; never unshipped', () => {
    expect(billableAt({ ...o, deliveredAt: d(4) })).toEqual(d(4))
    expect(billableAt(o)).toEqual(d(31))
    expect(billableAt({ ...o, rtoInitiatedAt: d(5), deliveredAt: d(4) })).toBeNull()
    expect(billableAt({ ...o, lostAt: d(6) })).toBeNull()
    expect(billableAt({ ...o, shippedAt: null })).toBeNull()
    expect(billableDelivered(o, d(30))).toBe(false); expect(billableDelivered(o, d(31))).toBe(true)
  })
})

describe('plan changes (billing B4)', () => {
  it('an upgrade on 16 November: the December invoice adds November’s difference by its days; no change, no line', () => {
    const upgraded = [launch, { ...growth, startsAt: ist(2026, 11, 16) }]
    const b = computeBill(base(12, { plans: upgraded, prevPlanBilled: 149900 }))
    const diff = b.lines.find((l) => l.kind === 'change')!
    // November by days: Launch for 15 of 30, Growth for 15 of 30, less the Launch month already charged.
    expect(diff.taxable).toBe(Math.round(149900 * 15 / 30) + Math.round(499900 * 15 / 30) - 149900)
    expect(b.lines[0]).toMatchObject({ kind: 'plan', taxable: 499900 }) // December in advance, at Growth
    expect(computeBill(base(12, { plans: [launch], prevPlanBilled: 149900 })).lines.some((l) => l.kind === 'change')).toBe(false)
  })
  it('an order is charged at the rate of the plan it SHIPPED under, though it is delivered after an upgrade', () => {
    const upgraded = [launch, { ...growth, startsAt: ist(2026, 11, 30) }]
    const o = { orderId: 'o1', number: 'KS-1', billableAt: ist(2026, 11, 30), rateAt: ist(2026, 11, 20), merchandiseNet: 100000 }
    const b = computeBill(base(12, { plans: upgraded, feeOrders: [o], prevPlanBilled: 149900 }))
    expect(b.fees[0]).toMatchObject({ feeBps: 200, fee: 2000 }) // Launch's 2%, not Growth's 1%
    const later = computeBill(base(12, { plans: upgraded, feeOrders: [{ ...o, rateAt: ist(2026, 11, 30) }], prevPlanBilled: 149900 }))
    expect(later.fees[0]).toMatchObject({ feeBps: 100 })
  })
  it('shipped before the shop had a plan: the first plan’s rate; billable before any plan: no fee', () => {
    const o = { orderId: 'o1', number: 'KS-1', billableAt: ist(2026, 11, 3), rateAt: ist(2026, 10, 30), merchandiseNet: 100000 }
    expect(computeBill(base(12, { feeOrders: [o] })).fees[0]).toMatchObject({ feeBps: 200 })
    expect(computeBill(base(12, { feeOrders: [{ ...o, billableAt: ist(2026, 10, 31) }] })).fees).toHaveLength(0)
  })
  it('a downgrade starts on the 1st: nothing to make up, never a refund', () => {
    const down = [{ ...growth, startsAt: ist(2026, 10) }, { ...launch, startsAt: ist(2026, 12) }]
    const b = computeBill(base(12, { plans: down, prevPlanBilled: 499900 }))
    expect(b.lines.some((l) => l.kind === 'change')).toBe(false)
    expect(b.lines[0]).toMatchObject({ taxable: 149900 })
  })
})

describe('trials (TR0·3): nothing billed while a trial runs on the 1st; a waiting upgrade; a pause is free', () => {
  it('an upgrade that waited for the trial end: billed by its days next month, never in advance during the trial', () => {
    const plans = [{ ...launch, trialEndsAt: ist(2026, 12, 13) }, { ...growth, startsAt: ist(2026, 12, 13), trialEndsAt: null }]
    expect(computeBill(base(12, { plans })).lines.some((l) => l.kind === 'plan')).toBe(false)
    const jan = computeBill(base(1 + 12, { plans, prevPlanBilled: 0, monthStart: ist(2027, 1), nextMonthStart: ist(2027, 2), prevMonthStart: ist(2026, 12) }))
    expect(jan.lines.find((l) => l.kind === 'change')!.taxable).toBe(Math.round(499900 * 19 / 31)) // Growth 13–31 Dec
    expect(jan.lines.find((l) => l.kind === 'plan')).toMatchObject({ taxable: 499900 })
  })
  it('the days a shop is paused cost no plan', () => {
    const plans = [{ ...launch, trialEndsAt: ist(2026, 12, 13) }]
    const jan = computeBill(base(13, { plans, prevPlanBilled: 0, monthStart: ist(2027, 1), nextMonthStart: ist(2027, 2), prevMonthStart: ist(2026, 12), pause: { from: ist(2026, 12, 20), to: null } }))
    expect(jan.lines.find((l) => l.kind === 'change')!.taxable).toBe(Math.round(149900 * 19 / 31) - Math.round(149900 * 12 / 31)) // 13–19 Dec only
    expect(jan.lines.some((l) => l.kind === 'plan')).toBe(false) // all of January paused
  })
})

describe('planChangeAdds (billing B4): the dialog shows what the invoice will bill', () => {
  const nov = ist(2026, 11), dec = ist(2026, 12)
  it('equals the next invoice’s change line, to the paisa', () => {
    const now = ist(2026, 11, 16)
    const shown = planChangeAdds([launch], growth.planVersion, now, nov, dec, 149900)
    const billed = computeBill(base(12, { plans: [launch, { ...growth, startsAt: now }], prevPlanBilled: 149900 })).lines.find((l) => l.kind === 'change')!.taxable
    expect(shown).toBe(billed)
    expect(shown).toBeGreaterThan(0)
  })
  it('a second upgrade adds only its own difference; no invoice this month or a downgrade adds nothing', () => {
    const first = [launch, { ...growth, startsAt: ist(2026, 11, 10) }]
    const now = ist(2026, 11, 20)
    const scale = { ...growth.planVersion, planCode: 'scale' as const, monthlyPrice: 1499900 as never }
    const total = planChangeOwed([...first, { ...growth, planVersion: scale, startsAt: now }], nov, dec, 149900)
    expect(planChangeAdds(first, scale, now, nov, dec, 149900)).toBe(total - planChangeOwed(first, nov, dec, 149900))
    expect(planChangeAdds([launch], growth.planVersion, now, nov, dec, null)).toBe(0)
    expect(planChangeAdds([{ ...growth, startsAt: ist(2026, 10) }], launch.planVersion, now, nov, dec, 499900)).toBe(0)
  })
})
