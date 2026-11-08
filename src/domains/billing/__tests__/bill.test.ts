// Billing B0: computeBill reproduces the unit-economics review's worked months to the paisa (2026-11-08).
import { describe, expect, it } from 'vitest'
import { computeBill, type BillInput, type PlanRow } from '../bill'
import { billableAt, billableDelivered } from '@/domains/orders/outcomes'
import { feeForOrder } from '@/domains/plans/entitlements'
import { paise } from '@/domains/money/paise'

const ist = (y: number, m: number, d = 1) => new Date(Date.UTC(y, m - 1, d) - 330 * 60_000)
const launch: PlanRow = { startsAt: ist(2026, 11), planVersion: { planCode: 'launch', name: 'Launch', monthlyPrice: paise(149900), includedOrders: 150, feeBps: 200 }, trialEndsAt: null, customMonthlyPrice: null }
const growth: PlanRow = { ...launch, planVersion: { planCode: 'growth', name: 'Growth', monthlyPrice: paise(499900), includedOrders: 1500, feeBps: 100 } }
const orders = (n: number, net: number, at: Date) => Array.from({ length: n }, (_, k) => ({ orderId: `o${k}`, number: `KS-${1000 + k}`, billableAt: at, merchandiseNet: net }))
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
    const trial = { ...launch, trialEndsAt: ist(2026, 11, 16) }
    const b = computeBill(base(11, { plans: [trial] }))
    expect(b.lines[0]!.taxable).toBe(Math.round(149900 * 15 / 30))
    const tiny = computeBill(base(12, { plans: [{ ...launch, trialEndsAt: ist(2027, 1) }], feeOrders: orders(5, 85714, ist(2026, 11, 20)) }))
    expect([tiny.rolled, tiny.taxable, tiny.total]).toEqual([true, 8570, 0])
    const again = computeBill(base(12, { plans: [{ ...launch, trialEndsAt: ist(2027, 1) }], feeOrders: orders(5, 85714, ist(2026, 11, 20)), rolledLastMonth: true }))
    expect(again.rolled).toBe(false)
  })
  it('a plan starting mid-month, an add-on by its days, and a rolled bill carried in', () => {
    // Growth from 16 December (Launch before it): each by its days of 31.
    const b = computeBill(base(12, { plans: [launch, { ...growth, startsAt: ist(2026, 12, 16) }] }))
    expect(b.lines.filter((l) => l.kind === 'plan').map((l) => l.taxable)).toEqual([Math.round(149900 * 15 / 31), Math.round(499900 * 16 / 31)])
    const a = computeBill(base(12, { addons: [{ module: 'size_fit', name: 'Size and fit', monthlyPrice: paise(99900), startsAt: ist(2026, 12, 11), endsAt: null, trialEndsAt: null }] }))
    expect(a.lines.find((l) => l.kind === 'addon')!.taxable).toBe(Math.round(99900 * 21 / 31))
    const c = computeBill(base(12, { carry: 8570, rolledLastMonth: true }))
    expect(c.lines.find((l) => l.kind === 'carry')!.taxable).toBe(8570)
    expect(c.taxable).toBe(149900 + 8570)
  })
  it('a negative month carries forward and is never refunded', () => {
    const b = computeBill(base(12, { plans: [{ ...launch, trialEndsAt: ist(2027, 1) }], credits: [{ orderId: 'x', number: 'KS-1', fee: paise(5000), invoiceNumber: null }] }))
    expect([b.total, b.carryOut]).toEqual([0, -5000])
  })
  it('the fee follows the plan in force when the order became billable', () => {
    const history = [launch, { ...growth, startsAt: ist(2026, 11, 20) }]
    expect(feeForOrder(history, { merchandiseNet: 100000, billableAt: ist(2026, 11, 19) })!.feeBps).toBe(200)
    expect(feeForOrder(history, { merchandiseNet: 100000, billableAt: ist(2026, 11, 21) })!.feeBps).toBe(100)
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
