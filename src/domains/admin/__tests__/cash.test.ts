import { describe, expect, it } from 'vitest'
import {
  averageNet, booksFigure, CASH_KINDS, cashToday, differenceOf, dueCostsByMonth, firstBelow, forecast, gstShare, IN_KINDS, KIND_DIRECTION, latestBalances, monthRow,
  openingOf, OUT_KINDS, parseBalance, parseCashAmount, runRate, runwayEnd, unpaidCostsToMonthEnd, type Balance, type CashModel, type Entry,
} from '../cash'
import type { CostItem } from '../costs'
import { GST_BPS } from '@/domains/billing/gst-rate'
import { monthKey } from '@/domains/time/month'

const R = 100 // paise to a rupee, so a test reads in rupees
const bal = (id: string, accountId: string, asOf: string, rupees: number, createdAt = '2026-11-22T10:00:00Z'): Balance => ({ id, accountId, asOf, paise: rupees * R, createdAt })
const entry = (id: string, kind: Entry['kind'], rupees: number, happenedOn: string | null, expectedOn: string | null = null): Entry => ({ id, kind, amount: rupees * R, happenedOn, expectedOn, accountId: null })
const cost = (id: string, o: Partial<CostItem> = {}): CostItem => ({ id, name: id, kind: 'recurring', cadence: 'monthly', amount: 1_000_00, currency: 'INR', varies: false, anchorOn: '2026-11-26', endsOn: null, category: 'software', ...o })
const model = (o: Partial<CashModel> = {}): CashModel => ({
  today: '2026-11-23', billingByMonth: {}, costsByMonth: {}, dueCosts: {}, entries: [], gstActual: { thisMonth: null, nextMonth: null }, gstBps: GST_BPS, ...o,
})

describe('the kinds', () => {
  it('every kind has a direction, and the two lists cover them', () => {
    expect(Object.keys(KIND_DIRECTION).sort()).toEqual([...CASH_KINDS].sort())
    expect([...IN_KINDS, ...OUT_KINDS].sort()).toEqual([...CASH_KINDS].sort())
    expect(KIND_DIRECTION.funding).toBe('in'); expect(KIND_DIRECTION.gst_paid).toBe('out')
  })
})

describe('cash in the bank', () => {
  it('the latest balance of each account; a tie on the day goes to the later one, then the id', () => {
    const latest = latestBalances([bal('a', 'x', '2026-11-01', 100), bal('b', 'x', '2026-11-14', 90), bal('c', 'x', '2026-11-14', 95, '2026-11-22T12:00:00Z'), bal('d', 'y', '2026-11-01', 50)])
    expect(latest.map((b) => [b.accountId, b.id]).sort()).toEqual([['x', 'c'], ['y', 'd']])
    const tie = latestBalances([bal('a', 'x', '2026-11-14', 1), bal('b', 'x', '2026-11-14', 2)])
    expect(tie[0]!.id).toBe('b')
  })
  it('the books roll the main balance forward by what came in and went out after its day, entries included', () => {
    const main = bal('m', 'main', '2026-11-22', 175_000)
    const entries = [entry('f', 'funding', 100_000, '2026-11-23'), entry('o', 'gst_paid', 4_000, '2026-11-23'), entry('old', 'grant', 9_999, '2026-11-20')]
    expect(booksFigure(main, { billingIn: 20_000 * R, costsOut: 5_000 * R }, entries, '2026-11-23')).toBe((175_000 + 20_000 - 5_000 + 100_000 - 4_000) * R)
  })
  it('no books figure without a main account, or when its balance is dated after the day asked', () => {
    expect(booksFigure(null, { billingIn: 0, costsOut: 0 }, [], '2026-11-23')).toBeNull()
    expect(booksFigure(bal('m', 'main', '2026-11-25', 1), { billingIn: 0, costsOut: 0 }, [], '2026-11-23')).toBeNull()
    expect(differenceOf(100, null)).toBeNull()
    expect(differenceOf(1_750_000, 1_924_000)).toBe(-174_000)
  })
  it('cash today is the main account rolled forward plus every other account as typed', () => {
    const latest = [bal('m', 'main', '2026-11-22', 175_000), bal('r', 'res', '2026-11-01', 130_000)]
    expect(cashToday(latest, 'main', { billingIn: 26_500 * R, costsOut: 0 }, [], '2026-11-23')).toBe((175_000 + 26_500 + 130_000) * R)
    expect(cashToday(latest, null, { billingIn: 26_500 * R, costsOut: 0 }, [], '2026-11-23')).toBe(305_000 * R)
  })
})

describe('the run-rate and GST', () => {
  const m = (o: Record<string, number>) => o
  it('the average of the last three full months from the first month with any billing', () => {
    expect(runRate(m({ '2026-08': 14_000, '2026-09': 18_500, '2026-10': 22_000, '2026-11': 26_500 }), '2026-11-23')).toBe(Math.round((14_000 + 18_500 + 22_000) / 3))
  })
  it('fewer months when fewer exist; none is zero; a month before the first is not a zero; a zero after it counts', () => {
    expect(runRate({}, '2026-11-23')).toBe(0)
    expect(runRate({ '2026-10': 900 }, '2026-11-23')).toBe(900)
    expect(runRate({ '2026-09': 600, '2026-10': 0 }, '2026-11-23')).toBe(300)
    expect(runRate({ '2026-08': 300, '2026-10': 900 }, '2026-11-23')).toBe(400) // Aug 300, Sep 0, Oct 900
  })
  it('GST is the share inside an amount that carries it, rounded once', () => {
    expect(gstShare(2_650_000, 1800)).toBe(404_237)
    expect(gstShare(0, 1800)).toBe(0)
  })
})

describe('costs by month from their due dates', () => {
  it('monthly every month, quarterly in its months, yearly once; dollars at the rate; a dollar cost with no rate is counted', () => {
    const items = [
      cost('m', { amount: 1_000_00 }), cost('q', { cadence: 'quarterly', anchorOn: '2026-12-31', amount: 7_500_00 }), cost('y', { cadence: 'yearly', anchorOn: '2026-12-14', amount: 1_299_00 }),
      cost('u', { currency: 'USD', amount: 20_000_000, anchorOn: '2026-12-26' }), cost('x', { kind: 'one_time', cadence: null }),
    ]
    const r = dueCostsByMonth(items, 942_000, '2026-12', 4)
    expect(r.byMonth['2026-12']).toBe(1_000_00 + 7_500_00 + 1_299_00 + 188_400)
    expect(r.byMonth['2027-01']).toBe(1_000_00 + 188_400)
    expect(r.byMonth['2027-03']).toBe(1_000_00 + 7_500_00 + 188_400)
    expect(r.unrated).toBe(0)
    expect(dueCostsByMonth(items, null, '2026-12', 1).unrated).toBe(1)
  })
  it('an ended cost is not due after its end', () => {
    expect(dueCostsByMonth([cost('e', { endsOn: '2026-12-31' })], null, '2027-01', 2).byMonth).toEqual({})
  })
})

describe('a month, from what happened or what is due', () => {
  it('a past month: billing and costs that happened, done entries, planned ones ignored', () => {
    const m = model({ billingByMonth: { '2026-10': 22_000 * R }, costsByMonth: { '2026-10': 54_271 * R }, entries: [entry('g', 'gst_paid', 6_400, '2026-10-20'), entry('p', 'grant', 150_000, null, '2026-10-30')] })
    const r = monthRow('2026-10', 500_000 * R, m)
    expect(r).toMatchObject({ actual: true, billing: 22_000 * R, costs: 54_271 * R, otherOut: 6_400 * R, otherIn: 0 })
    expect(r.closing).toBe((500_000 + 22_000 - 54_271 - 6_400) * R)
  })
  it('a coming month: the run-rate, the costs due, the GST estimate, planned entries', () => {
    const m = model({ billingByMonth: { '2026-08': 14_000 * R, '2026-09': 18_500 * R, '2026-10': 22_000 * R }, dueCosts: { '2026-12': 63_070 * R }, entries: [entry('p', 'grant', 150_000, null, '2026-12-10')] })
    const rate = Math.round((14_000 + 18_500 + 22_000) / 3) * R
    const r = monthRow('2026-12', 300_000 * R, m)
    expect(r.billing).toBe(Math.round(((14_000 + 18_500 + 22_000) * R) / 3))
    expect(r.otherIn).toBe(150_000 * R)
    expect(r.gst).toBe(gstShare(r.billing, 1800))
    expect(r.closing).toBe(300_000 * R + r.billing + 150_000 * R - 63_070 * R - r.gst)
    void rate
  })
  it('next month uses the GST on invoices actually issued; later months estimate', () => {
    const m = model({ billingByMonth: { '2026-10': 22_000 * R }, gstActual: { thisMonth: null, nextMonth: 5_000 * R } })
    expect(monthRow('2026-12', 0, m).gst).toBe(5_000 * R)
    expect(monthRow('2027-01', 0, m).gst).toBe(gstShare(22_000 * R, 1800))
  })
})

describe('the opening', () => {
  const items = [cost('v', { anchorOn: '2026-11-26', amount: 1_884_00 }), cost('w', { anchorOn: '2026-11-20', amount: 1_380_00 })]
  it('less costs still unpaid to month end, overdue included; a paid due is left out', () => {
    expect(unpaidCostsToMonthEnd(items, new Map(), null, '2026-11-23')).toBe((1_884 + 1_380) * R)
    expect(unpaidCostsToMonthEnd(items, new Map([['w', new Set(['2026-11-20'])]]), null, '2026-11-23')).toBe(1_884 * R)
  })
  it('less this month\'s GST unless a gst_paid entry sits in the month; planned entries to month end counted', () => {
    const base = model({ billingByMonth: { '2026-10': 22_000 * R }, gstActual: { thisMonth: 3_000 * R, nextMonth: null } })
    expect(openingOf(300_000 * R, 3_264 * R, base)).toBe((300_000 - 3_264 - 3_000) * R)
    const paid = model({ ...base, entries: [entry('g', 'gst_paid', 3_000, '2026-11-20')] })
    expect(openingOf(300_000 * R, 3_264 * R, paid)).toBe((300_000 - 3_264) * R)
    const planned = model({ ...base, entries: [entry('p', 'grant', 50_000, null, '2026-11-29'), entry('q', 'tax_paid', 10_000, null, '2026-11-25'), entry('later', 'grant', 9_999, null, '2026-12-02')] })
    expect(openingOf(300_000 * R, 0, planned)).toBe((300_000 - 3_000 + 50_000 - 10_000) * R)
  })
  it('with no issued invoices, this month\'s GST is estimated from last month\'s billing', () => {
    const m = model({ billingByMonth: { '2026-10': 22_000 * R } })
    expect(openingOf(300_000 * R, 0, m)).toBe(300_000 * R - gstShare(22_000 * R, 1800))
  })
})

describe('the forecast, runway and floor', () => {
  const m = model({ billingByMonth: { '2026-08': 14_000 * R, '2026-09': 18_500 * R, '2026-10': 22_000 * R }, dueCosts: Object.fromEntries(Array.from({ length: 36 }, (_, i) => [monthKey('2026-11-23', i + 1), 54_271 * R])) })
  it('is one series: each closing is the next opening, and the first is the month after this one', () => {
    const rows = forecast(300_000 * R, m, 6)
    expect(rows.map((r) => r.month)).toEqual(['2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05'])
    for (let i = 1; i < rows.length; i++) expect(rows[i]!.opening).toBe(rows[i - 1]!.closing)
    expect(rows[0]!.opening).toBe(300_000 * R)
  })
  it('runway is the first month below zero, from the same 36 months; none: null', () => {
    const rows = forecast(300_000 * R, m)
    expect(rows).toHaveLength(36)
    const end = runwayEnd(rows)!
    const at = rows.findIndex((r) => r.month === end)
    expect(rows[at]!.closing).toBeLessThan(0)
    expect(rows[at - 1]!.closing).toBeGreaterThanOrEqual(0)
    expect(runwayEnd(forecast(300_000 * R, model({ billingByMonth: { '2026-10': 900_000 * R } })))).toBeNull()
  })
  it('the floor: the first month under it; no floor, or none under: null', () => {
    const rows = forecast(300_000 * R, m, 6)
    const floor = 250_000 * R
    const first = firstBelow(rows, floor)!
    expect(rows.find((r) => r.month === first)!.closing).toBeLessThan(floor)
    expect(firstBelow(rows, null)).toBeNull()
    expect(firstBelow(rows, 1)).toBeNull()
  })
  it('a hand sum: opening + run-rate − costs − GST each month', () => {
    const rate = Math.round(((14_000 + 18_500 + 22_000) * R) / 3), gst = gstShare(rate, 1800)
    const rows = forecast(300_000 * R, m, 3)
    expect(rows[2]!.closing).toBe(300_000 * R + 3 * rate - 3 * 54_271 * R - 3 * gst)
  })
})

describe('net each month', () => {
  it('the average of the last three full months, billing in less costs and entries out; none without history', () => {
    const m = model({ billingByMonth: { '2026-08': 14_000 * R, '2026-09': 18_500 * R, '2026-10': 22_000 * R }, costsByMonth: { '2026-08': 53_800 * R, '2026-09': 58_900 * R, '2026-10': 54_271 * R }, entries: [entry('g', 'gst_paid', 6_400, '2026-10-20')] })
    expect(averageNet(m)).toBe(Math.round(((14_000 - 53_800) + (18_500 - 58_900) + (22_000 - 54_271 - 6_400)) * R / 3))
    expect(averageNet(model())).toBeNull()
  })
})

describe('what a person types', () => {
  it('a balance is signed, in paise, zero allowed, and capped at ₹100 crore either way', () => {
    expect(parseBalance('2,95,000')).toBe(29_500_000)
    expect(parseBalance('-17,400.50')).toBe(-1_740_050)
    expect(parseBalance('−5000')).toBe(-500_000)
    expect(parseBalance('0')).toBe(0)
    expect(parseBalance('₹1,00,00,00,000')).toBe(100_000_000_000)
    for (const bad of ['', 'abc', '1.234', '1e5', '1000000000001', '--5']) expect(parseBalance(bad), bad).toBeNull()
  })
  it('an entry amount is above zero (a floor may be zero), never negative', () => {
    expect(parseCashAmount('1,50,000')).toBe(15_000_000)
    expect(parseCashAmount('0')).toBeNull()
    expect(parseCashAmount('0', true)).toBe(0)
    expect(parseCashAmount('-5')).toBeNull()
  })
})
