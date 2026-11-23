import { describe, expect, it } from 'vitest'
import { fiscalYear } from '@/domains/counters/fiscal-year'
import { istDayKey } from '@/domains/time/day'
import {
  anchorMayMove, burnOf, byCategory, cleanText, costsCsv, parseAmount, parseDay, parseRupees, dueDates, dueRows, dueState, fyRange, fyStartOf, isDueDate, isLive, monthlyPaise, spentIn, usdToPaise,
  type CostItem, type CostPayment,
} from '../costs'

const item = (o: Partial<CostItem> = {}): CostItem => ({
  id: 'i1', name: 'Vercel Pro', kind: 'recurring', cadence: 'monthly', amount: 20_000_000, currency: 'USD', varies: false,
  anchorOn: '2026-01-31', endsOn: null, category: 'infrastructure', ...o,
})

describe('dueDates', () => {
  it('derives every date from the anchor, so 31 Jan goes 28 Feb then back to 31 Mar', () => {
    expect(dueDates(item(), '2026-01-01', '2026-04-30')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
  })
  it('quarterly and yearly, 29 Feb falls to 28 Feb in a common year', () => {
    expect(dueDates(item({ cadence: 'quarterly', anchorOn: '2026-11-30' }), '2026-11-01', '2027-12-31')).toEqual(['2026-11-30', '2027-02-28', '2027-05-30', '2027-08-30', '2027-11-30'])
    expect(dueDates(item({ cadence: 'yearly', anchorOn: '2028-02-29' }), '2028-01-01', '2030-12-31')).toEqual(['2028-02-29', '2029-02-28', '2030-02-28'])
  })
  it('nothing before the anchor, nothing after the end', () => {
    expect(dueDates(item({ anchorOn: '2026-06-15', endsOn: '2026-08-31' }), '2026-01-01', '2026-12-31')).toEqual(['2026-06-15', '2026-07-15', '2026-08-15'])
  })
  it('a one-time item has no due dates', () => {
    expect(dueDates(item({ kind: 'one_time', cadence: null }), '2026-01-01', '2026-12-31')).toEqual([])
  })
})

describe('dueState', () => {
  const today = '2026-11-23'
  it('counts unpaid dues, names the next one, and is overdue past it', () => {
    const it1 = item({ anchorOn: '2026-09-20', cadence: 'monthly' })
    const s = dueState(it1, new Set(['2026-09-20']), today)
    expect(s.unpaid).toEqual(['2026-10-20', '2026-11-20'])
    expect(s.next).toBe('2026-10-20')
    expect(s.overdueDays).toBe(34)
    expect(s.tone).toBe('overdue')
  })
  it('soon within 7 days, later beyond', () => {
    expect(dueState(item({ anchorOn: '2026-11-26' }), new Set(), today)).toMatchObject({ next: '2026-11-26', tone: 'soon', inDays: 3 })
    expect(dueState(item({ anchorOn: '2026-12-14' }), new Set(), today)).toMatchObject({ tone: 'later', inDays: 21 })
  })
  it('a paid due moves next to the one after it', () => {
    expect(dueState(item({ anchorOn: '2026-11-26' }), new Set(['2026-11-26']), today).next).toBe('2026-12-26')
  })
  it('an ended item has no next after its end; a one-time one has none', () => {
    expect(dueState(item({ anchorOn: '2026-10-01', endsOn: '2026-10-31' }), new Set(['2026-10-01']), today).next).toBeNull()
    expect(dueState(item({ kind: 'one_time', cadence: null }), new Set(), today).next).toBeNull()
  })
  it('never looks back more than 13 months', () => {
    const s = dueState(item({ anchorOn: '2020-01-05' }), new Set(), today)
    expect(s.unpaid.length).toBeLessThanOrEqual(14)
    expect((s.unpaid[0] ?? '') >= '2025-10-23').toBe(true)
  })
})

describe('isDueDate and the anchor', () => {
  it('only a real due date is accepted for a payment', () => {
    expect(isDueDate(item({ anchorOn: '2026-01-31' }), '2026-02-28')).toBe(true)
    expect(isDueDate(item({ anchorOn: '2026-01-31' }), '2026-02-27')).toBe(false)
    expect(isDueDate(item({ anchorOn: '2026-01-31', endsOn: '2026-02-01' }), '2026-02-28')).toBe(false)
  })
  it('the anchor may move only past the last paid period', () => {
    expect(anchorMayMove('2026-12-05', '2026-11-26')).toBe(true)
    expect(anchorMayMove('2026-11-20', '2026-11-26')).toBe(false)
    expect(anchorMayMove('2026-12-05', null)).toBe(true)
  })
})

describe('money', () => {
  it('converts micro-dollars to paise at a rate in rupees × 10,000, rounded once', () => {
    expect(usdToPaise(20_000_000, 942_000)).toBe(188_400)
    expect(usdToPaise(25_000_000, 942_000)).toBe(235_500)
  })
  it('rounds a half paise up, and stays exact for a ₹1 crore dollar bill', () => {
    expect(usdToPaise(10, 5_000_000)).toBe(1)
    expect(usdToPaise(9, 5_000_000)).toBe(0)
    expect(usdToPaise(106_000_000_000, 942_000)).toBe(998_520_000)
  })
  it('monthly equivalent per cadence; null for a dollar cost with no rate', () => {
    expect(monthlyPaise(item({ cadence: 'yearly', currency: 'INR', amount: 129_900 }), null)).toBeCloseTo(10_825)
    expect(monthlyPaise(item({ cadence: 'quarterly', currency: 'INR', amount: 750_000 }), null)).toBe(250_000)
    expect(monthlyPaise(item(), null)).toBeNull()
    expect(monthlyPaise(item({ kind: 'one_time', cadence: null }), 942_000)).toBeNull()
  })
  it('burn sums live repeating costs at full precision and rounds once; the mockup rows give ₹16,879', () => {
    const rows = [
      item({ id: 'a', amount: 20_000_000 }), item({ id: 'b', amount: 25_000_000 }),
      item({ id: 'c', currency: 'INR', amount: 138_000 }),
      item({ id: 'd', cadence: 'yearly', currency: 'INR', amount: 129_900 }),
      item({ id: 'e', amount: 60_000_000, varies: true }),
      item({ id: 'f', currency: 'INR', amount: 300_000, varies: true }),
      item({ id: 'g', cadence: 'quarterly', currency: 'INR', amount: 750_000 }),
      item({ id: 'h', kind: 'one_time', cadence: null, currency: 'INR', amount: 2_500_000 }),
      item({ id: 'x', currency: 'INR', amount: 1_200, endsOn: '2026-10-31' }),
    ]
    const b = burnOf(rows, '2026-11-23', 942_000)
    expect(b).toMatchObject({ monthlyPaise: 1_687_925, yearlyPaise: 20_255_100, count: 7, missingRate: 0 })
  })
  it('a dollar cost with no rate is left out and counted', () => {
    expect(burnOf([item(), item({ id: 'z', currency: 'INR', amount: 100_000 })], '2026-11-23', null)).toMatchObject({ monthlyPaise: 100_000, missingRate: 1 })
  })
  it('isLive: not ended before today', () => {
    expect(isLive(item({ endsOn: '2026-11-22' }), '2026-11-23')).toBe(false)
    expect(isLive(item({ endsOn: '2026-11-23' }), '2026-11-23')).toBe(true)
  })
})

describe('months and years', () => {
  const pay = (paidOn: string, inr: number, category = 'ai'): CostPayment => ({ id: paidOn + inr, itemId: 'i', paidOn, periodFor: paidOn, inrPaise: inr, category })
  it('spent in an IST month is a sum of inr paise by paid-on day', () => {
    const ps = [pay('2026-11-01', 235_500), pay('2026-11-30', 10_000), pay('2026-10-31', 99_999), pay('2026-12-01', 5)]
    expect(spentIn(ps, '2026-11')).toEqual({ paise: 245_500, count: 2 })
  })
  it('the financial year runs April to March', () => {
    expect(fyStartOf('2026-03-31')).toBe(2025)
    expect(fyStartOf('2026-04-01')).toBe(2026)
    expect(fyRange(2026)).toEqual({ from: '2026-04-01', to: '2027-03-31' })
  })
})

describe('dueRows for Today', () => {
  it('one row per cost overdue or due within 7 days, overdue first, at most 20', () => {
    const a = item({ id: 'a', name: 'Workspace', anchorOn: '2026-11-20', currency: 'INR', amount: 138_000 })
    const b = item({ id: 'b', name: 'Vercel', anchorOn: '2026-11-26' })
    const c = item({ id: 'c', name: 'Supabase', anchorOn: '2026-12-01' })
    const rows = dueRows([c, b, a], new Map(), '2026-11-23')
    expect(rows.map((r) => r.id)).toEqual(['a', 'b'])
    expect(rows[0]?.tone).toBe('overdue')
  })
})

describe('more cases', () => {
  const today = '2026-11-23'
  it('dueRows skips an ended cost and a one-time one, and caps at 20', () => {
    const ended = item({ id: 'e', anchorOn: '2026-09-01', endsOn: '2026-09-30' })
    const once = item({ id: 'o', kind: 'one_time', cadence: null })
    expect(dueRows([ended, once], new Map(), today)).toEqual([])
    const many = Array.from({ length: 25 }, (_, i) => item({ id: `m${i}`, name: `Cost ${String(i).padStart(2, '0')}`, anchorOn: '2026-11-20' }))
    expect(dueRows(many, new Map(), today)).toHaveLength(20)
  })
  it('quarterly and yearly look ahead far enough to name the next due', () => {
    expect(dueState(item({ cadence: 'quarterly', anchorOn: '2026-11-22' }), new Set(['2026-11-22']), today).next).toBe('2027-02-22')
    expect(dueState(item({ cadence: 'yearly', anchorOn: '2026-11-20' }), new Set(['2026-11-20']), today)).toMatchObject({ next: '2027-11-20', tone: 'later' })
  })
  it('an anchor in the future starts there, and from far after the anchor still lands on the grid', () => {
    expect(dueDates(item({ anchorOn: '2027-03-10' }), '2026-01-01', '2027-05-31')).toEqual(['2027-03-10', '2027-04-10', '2027-05-10'])
    expect(dueDates(item({ anchorOn: '2024-01-31' }), '2026-02-01', '2026-03-31')).toEqual(['2026-02-28', '2026-03-31'])
  })
  it('a yearly dollar cost is a twelfth of its rupee value a month', () => {
    expect(monthlyPaise(item({ cadence: 'yearly', amount: 120_000_000 }), 942_000)).toBeCloseTo(94_200)
  })
  it('byCategory sums a month, biggest first, ties by name', () => {
    const p = (paidOn: string, inrPaise: number, category: string): CostPayment => ({ id: paidOn + category + inrPaise, itemId: 'i', paidOn, periodFor: paidOn, inrPaise, category })
    expect(byCategory([p('2026-11-03', 100, 'ai'), p('2026-11-04', 100, 'design'), p('2026-11-05', 50, 'ai'), p('2026-10-31', 999, 'ai')], '2026-11'))
      .toEqual([{ category: 'ai', paise: 150 }, { category: 'design', paise: 100 }])
    expect(byCategory([p('2026-11-03', 100, 'software'), p('2026-11-04', 100, 'legal')], '2026-11').map((r) => r.category)).toEqual(['legal', 'software'])
  })
  it('the IST month boundary: 11:30 pm UTC on 30 Nov is 1 Dec in India', () => {
    expect(istDayKey(new Date('2026-11-30T19:00:00Z'))).toBe('2026-12-01')
    expect(istDayKey(new Date('2026-11-30T18:00:00Z'))).toBe('2026-11-30')
  })
  it('the financial year agrees with the invoice series, in every month', () => {
    for (const day of ['2026-01-15', '2026-03-31', '2026-04-01', '2026-12-31']) {
      const start = fyStartOf(day)
      expect(fiscalYear(new Date(`${day}T06:00:00Z`))).toBe(`${String(start % 100).padStart(2, '0')}-${String((start + 1) % 100).padStart(2, '0')}`)
    }
  })
})

describe('what a person types', () => {
  it('amounts are exact: rupees to paise, dollars to micro-dollars', () => {
    expect(parseAmount('1,380', 'INR')).toBe(138_000)
    expect(parseAmount('₹1,299.50', 'INR')).toBe(129_950)
    expect(parseAmount('57.50', 'USD')).toBe(57_500_000)
    expect(parseAmount('0.000125', 'USD')).toBe(125)
    expect(parseAmount('19.99', 'USD')).toBe(19_990_000)
  })
  it('refuses zero, too many decimals, words, negatives and anything over the ceiling', () => {
    for (const bad of ['0', '0.00', '', 'abc', '-5', '1.234', '10000000.01', '1e5']) expect(parseAmount(bad, 'INR'), bad).toBeNull()
    expect(parseAmount('10000000', 'INR')).toBe(1_000_000_000)
    expect(parseAmount('50000', 'USD')).toBe(50_000_000_000)
    expect(parseAmount('50000.01', 'USD')).toBeNull()
  })
  it('rupees for GST may be zero', () => {
    expect(parseRupees('0')).toBe(0)
    expect(parseRupees('0.00')).toBe(0)
    expect(parseRupees('381.36')).toBe(38_136)
    expect(parseRupees('x')).toBeNull()
  })
  it('clean text drops control and direction characters and collapses spaces', () => {
    expect(cleanText('  Vercel\u202e  Pro\n\t ')).toBe('Vercel Pro')
  })
  it('days must be real and in range', () => {
    expect(parseDay('2026-02-30', '2030-01-01')).toBeNull()
    expect(parseDay('2019-12-31', '2030-01-01')).toBeNull()
    expect(parseDay('2031-01-01', '2030-01-01')).toBeNull()
    expect(parseDay('2026-02-28', '2030-01-01')).toBe('2026-02-28')
    expect(parseDay('26-02-28', '2030-01-01')).toBeNull()
  })
})

describe('the CA export', () => {
  const row = (o: object = {}) => ({ id: 'p', itemId: 'i', periodFor: '2026-11-26', paidOn: '2026-11-23', amount: 20_000_000, currency: 'USD', inrPaise: 188_400, gstPaise: null, createdAt: new Date(0), category: 'Infrastructure', name: 'Vercel Pro', vendor: 'Vercel', ...o })
  it('one quoted line a payment, dollars and rupees, with a header', () => {
    expect(costsCsv([row()]).split('\r\n')).toEqual([
      '"Cost","Vendor","Category","Paid on","For the bill due","Currency","Billed","In rupees","GST in rupees"',
      '"Vercel Pro","Vercel","Infrastructure","2026-11-23","2026-11-26","USD","20.00","1884.00",""', '',
    ])
  })
  it('a name that starts like a formula is made text', () => {
    expect(costsCsv([row({ name: '=HYPERLINK("x")', vendor: '+1' })])).toContain(`"'=HYPERLINK(""x"")","'+1"`)
  })
})
