import { describe, expect, it } from 'vitest'
import {
  balanceOf, budgetState, budgetValid, creditsFor, crossedBelow, crossedWarn, drawPlan, expiresAt, LIMITS, listPaise, loadedPaise, LOW_BANNER, LOW_EMAIL,
  microUsdFor, nextPeriodEnd, parseRate, rateUsable, refuseReserve, renewalPlan, renewalStep, reserveFor, seatState, sessionBudgetMicro, settle,
  type Lot, type Renewal, type Seat,
} from '../credits'
import { CREDIT_PRICE, FREE_CREDITS, PACK, priced, quote, SEAT_PLANS, TYPED_MIN, typedCreditsValid, withGst } from '../prices'

const RATE = 94_0000 // ₹94 to the dollar, as rupees × 10,000 (spec § 8's input; FBIL quotes 4 decimals)
const d = (s: string) => new Date(s)

describe('prices (owner decision 7; owner 2026-11-22)', () => {
  it('GST totals the page shows', () => {
    expect(withGst(PACK.price)).toBe(2_35_882)
    expect(withGst(SEAT_PLANS.studio.price)).toBe(3_53_882)
    expect(withGst(SEAT_PLANS.plus.price)).toBe(11_79_882)
  })
  it('AutoPay maxima sit above each plan with GST and under ₹15,000', () => {
    for (const p of Object.values(SEAT_PLANS)) {
      expect(p.mandateMax).toBeGreaterThan(withGst(p.price))
      expect(p.mandateMax).toBeLessThanOrEqual(15_00_000)
    }
  })
  it('CGST + SGST in Frrata’s own state, IGST elsewhere, whole paise', () => {
    const intra = quote({ kind: 'pack' }, '29AAAAA0000A1Z5', '29')!
    expect([intra.cgst, intra.sgst, intra.igst, intra.total]).toEqual([17_991, 17_991, 0, 2_35_882])
    const inter = quote({ kind: 'pack' }, '29AAAAA0000A1Z5', '27')!
    expect([inter.cgst, inter.sgst, inter.igst]).toEqual([0, 0, 35_982])
    expect(quote({ kind: 'credits', credits: 250 }, null, '27')!.total).toBe(5_90_000)
    const plus = quote({ kind: 'seat', plan: 'plus' }, '29AAAAA0000A1Z5', '27')!
    expect([plus.credits, plus.total]).toEqual([500, 11_79_882])
    expect(plus.total).toBeLessThan(SEAT_PLANS.plus.mandateMax)
    expect(quote({ kind: 'credits', credits: 19 }, null, '27')).toBeNull()
  })
  it('the owner’s numbers', () => {
    expect([FREE_CREDITS, TYPED_MIN, CREDIT_PRICE, LOW_BANNER, LOW_EMAIL]).toEqual([20, 20, 2_000, 20, 50])
    expect(priced({ kind: 'seat', plan: 'studio' })).toEqual({ credits: 150, taxable: 2_99_900 })
  })
  it('Any amount is 20 to 4,000', () => {
    expect([19, 20, 4_000, 4_001, 20.5].map(typedCreditsValid)).toEqual([false, true, true, false, false])
    expect(priced({ kind: 'credits', credits: 4_001 })).toBeNull()
    expect(withGst(priced({ kind: 'credits', credits: 4_000 })!.taxable)).toBeLessThan(1_00_000_00)
  })
})

describe('the credit (decision 6)', () => {
  it('a page turn of $1.156 is 19 credits; a small edit 3', () => {
    expect(creditsFor(1_156_000n, RATE)).toBe(19)
    expect(creditsFor(180_000n, RATE)).toBe(3)
    expect(loadedPaise(1_156_000n, RATE)).toBe(11_954n) // ₹119.5304 rounded up → ⌈÷ 6.33⌉ = 19
  })
  it('stays exact past 2^53 (a day’s ceiling and more)', () => {
    expect(creditsFor(300_000_000n, RATE)).toBe(Math.ceil((300 * 9_400 * 1.1) / 633))
    expect(creditsFor(1_156_000n, 94_1997)).toBe(19)
  })
  it('a credit buys back about its own list cost', () => {
    const micro = microUsdFor(19, RATE)
    expect(creditsFor(micro, RATE)).toBe(19)
  })
  it('list cost in paise, rounded up; bad input refused', () => {
    expect(listPaise(1_000_000n, RATE)).toBe(9_400n)
    expect([parseRate('94.1997'), parseRate('94'), parseRate('94.19971'), parseRate('9.4'), parseRate('abc')]).toEqual([94_1997, 94_0000, null, null, null])
    expect(listPaise(1n, RATE)).toBe(1n)
    expect(() => microUsdFor(19, 0)).toThrow()
    expect(() => loadedPaise(1n, 0)).toThrow()
  })
  it('a rate older than 4 days is refused', () => {
    expect(rateUsable(d('2026-11-18T00:00:00Z'), d('2026-11-22T00:00:00Z'))).toBe(true)
    expect(rateUsable(d('2026-11-17T23:00:00Z'), d('2026-11-22T00:00:00Z'))).toBe(false)
    expect(rateUsable(null, d('2026-11-22T00:00:00Z'))).toBe(false)
  })
})

describe('lots', () => {
  const now = d('2026-11-22T10:00:00Z')
  const lot = (id: string, left: number, exp: string, created = '2026-10-01T00:00:00Z', test = false): Lot =>
    ({ id, kind: 'pack', left, expiresAt: d(exp), createdAt: d(created), test })
  it('use-by dates: 12 months bought, 90 days free', () => {
    expect(expiresAt('seat', d('2026-11-01T00:00:00Z')).toISOString()).toBe('2027-11-01T00:00:00.000Z')
    expect(expiresAt('grant', d('2026-11-01T00:00:00Z')).toISOString()).toBe('2027-01-30T00:00:00.000Z')
    for (const k of ['pack', 'credits', 'return'] as const) expect(expiresAt(k, d('2026-11-22T10:00:00Z')).toISOString()).toBe('2027-11-22T10:00:00.000Z')
    expect(expiresAt('pack', d('2028-02-29T10:00:00Z')).toISOString()).toBe('2029-02-28T10:00:00.000Z')
  })
  it('draws soonest use-by first, then oldest, then id; skips ended and empty lots', () => {
    const lots = [lot('b', 100, '2027-10-03T00:00:00Z'), lot('a', 42, '2027-01-31T00:00:00Z'), lot('x', 50, '2026-11-01T00:00:00Z'), lot('z', 0, '2027-01-01T00:00:00Z')]
    expect(drawPlan(lots, 50, now, true)).toEqual([{ lotId: 'a', credits: 42 }, { lotId: 'b', credits: 8 }])
    expect(drawPlan(lots, 143, now, true)).toBeNull()
    expect(balanceOf(lots, now, true)).toBe(142)
  })
  it('a test lot never pays where money is real (security H1)', () => {
    const lots = [lot('t', 5_000, '2027-01-01T00:00:00Z', undefined, true), lot('r', 10, '2027-06-01T00:00:00Z')]
    expect(drawPlan(lots, 20, now, true)).toBeNull()
    expect(drawPlan(lots, 20, now, false)).toEqual([{ lotId: 't', credits: 20 }])
  })
  it('settle never charges above the reserve', () => {
    expect(settle(19, 17)).toEqual({ charged: 17, back: 2 })
    expect(settle(19, 25)).toEqual({ charged: 19, back: 0 })
    expect(settle(19, 0)).toEqual({ charged: 0, back: 19 })
    expect(() => settle(19, Number.NaN)).toThrow()
  })
})

describe('budgets and limits (decision 5)', () => {
  it('warns at 80%, pauses at 100%', () => {
    expect([budgetState(0, null), budgetState(119, 150), budgetState(120, 150), budgetState(300, 300)]).toEqual(['none', 'ok', 'warn', 'paused'])
  })
  it('a budget never below what is used', () => {
    expect(budgetValid(250, 300)).toBe(false)
    expect(budgetValid(300, 300)).toBe(true)
    expect([budgetValid(100_001, 0), budgetValid(0, 0), budgetValid(10.5, 0), budgetValid(100_000, 0)]).toEqual([false, false, false, true])
  })
  it('the reserve stays within the turn limits', () => {
    expect([reserveFor(null), reserveFor(19), reserveFor(500), reserveFor(0), reserveFor(Number.NaN)]).toEqual([40, 19, 120, 1, 40])
  })
  it('refusals in order', () => {
    const ok = { credits: 19, balance: 142, budgetUsed: 0, budget: 300, personToday: 0, platformListToday: 0n, rateOk: true }
    expect(refuseReserve(ok)).toBeNull()
    expect(refuseReserve({ ...ok, rateOk: false })).toBe('rate')
    expect(refuseReserve({ ...ok, platformListToday: LIMITS.platformDayListPaise })).toBe('platform_day')
    expect(refuseReserve({ ...ok, personToday: 290 })).toBe('person_day')
    expect(refuseReserve({ ...ok, budgetUsed: 290 })).toBe('budget')
    expect(refuseReserve({ ...ok, balance: 8 })).toBe('balance')
  })
  it('the session budget leaves room for the last request and the builds', () => {
    expect(sessionBudgetMicro({ spentMicro: 1_000_000n, ceilingMicro: 4_000_000n, largestMicro: null, buildsMicro: 28_000n })).toBe(4_372_000n)
    expect(sessionBudgetMicro({ spentMicro: 0n, ceilingMicro: 100_000n, largestMicro: 900_000n, buildsMicro: 0n })).toBe(0n)
  })
  it('one alert a crossing', () => {
    expect([crossedBelow(52, 46, 50), crossedBelow(46, 40, 50)]).toEqual([true, false])
    expect([crossedWarn(100, 125, 150), crossedWarn(125, 130, 150)]).toEqual([true, false])
  })
})

describe('the seat', () => {
  const seat = (o: Partial<Seat> = {}): Seat => ({ plan: 'studio', periodEnd: d('2026-12-01T03:30:00Z'), cancelAt: null, failedAt: null, endedAt: null, nextPlan: null, ...o })
  const r = (o: Partial<Renewal> = {}, s: Partial<Seat> = {}): Renewal => ({ seat: seat(s), method: 'upi', attempts: 0, pending: 0, noticeQueuedAt: null, noticeSentAt: null, lastFailedAt: null, mandate: true, partnerLive: true, testMode: true, ...o })
  it('state from timestamps', () => {
    const now = d('2026-11-22T00:00:00Z')
    expect(seatState(null, now)).toBe('partner')
    expect(seatState(seat(), now)).toBe('active')
    expect(seatState(seat({ cancelAt: d('2026-12-01T03:30:00Z') }), now)).toBe('ending')
    expect(seatState(seat({ failedAt: d('2026-11-20T00:00:00Z') }), now)).toBe('failed')
    expect(seatState(seat({ failedAt: d('2026-11-14T00:00:00Z') }), now)).toBe('partner')
  })
  it('periods run month to month, a 31st falls to the month’s end', () => {
    expect(nextPeriodEnd(d('2027-01-31T03:30:00Z')).toISOString()).toBe('2027-02-28T03:30:00.000Z')
    expect(nextPeriodEnd(d('2026-11-22T03:30:00Z')).toISOString()).toBe('2026-12-22T03:30:00.000Z')
    expect(nextPeriodEnd(d('2026-12-31T03:30:15Z')).toISOString()).toBe('2027-01-31T03:30:15.000Z')
    expect(nextPeriodEnd(d('2028-01-30T00:00:00Z')).toISOString()).toBe('2028-02-29T00:00:00.000Z')
  })
  it('a plan change waits for the renewal', () => {
    expect(renewalPlan(seat())).toBe('studio')
    expect(renewalPlan(seat({ nextPlan: 'plus' }))).toBe('plus')
  })
  it('a notice 25 h ahead, the debit only 25 h after it was SENT', () => {
    expect(renewalStep(r(), d('2026-11-25T00:00:00Z'), true).kind).toBe('wait')
    expect(renewalStep(r(), d('2026-11-30T02:30:00Z'), true)).toEqual({ kind: 'notice', debitAt: d('2026-12-01T03:30:00Z') })
    const queued = { noticeQueuedAt: d('2026-11-30T02:30:00Z') }
    expect(renewalStep(r(queued), d('2026-12-01T04:00:00Z'), true)).toEqual({ kind: 'wait', why: 'the notice is not sent yet' })
    expect(renewalStep(r({ ...queued, noticeSentAt: d('2026-11-30T06:00:00Z') }), d('2026-12-01T04:00:00Z'), true).kind).toBe('wait')
    expect(renewalStep(r({ ...queued, noticeSentAt: d('2026-11-30T02:31:00Z') }), d('2026-12-01T04:00:00Z'), true)).toEqual({ kind: 'debit', attempt: 1 })
  })
  it('retries on days 1, 3, 5 each with its own notice; Partner on day 7', () => {
    const failed = { failedAt: d('2026-12-01T04:00:00Z') }
    const after1 = r({ attempts: 1, noticeQueuedAt: d('2026-11-30T02:30:00Z'), noticeSentAt: d('2026-11-30T02:31:00Z'), lastFailedAt: d('2026-12-01T04:00:00Z') }, failed)
    expect(renewalStep(after1, d('2026-12-01T05:00:00Z'), true)).toEqual({ kind: 'notice', debitAt: d('2026-12-02T06:00:00Z') })
    const after3 = r({ attempts: 3, noticeQueuedAt: d('2026-12-05T00:00:00Z'), noticeSentAt: d('2026-12-05T00:00:00Z'), lastFailedAt: d('2026-12-04T05:00:00Z') }, failed)
    expect(renewalStep(after3, d('2026-12-06T04:00:00Z'), true)).toEqual({ kind: 'debit', attempt: 4 })
    // Day 3: the notice goes 25 h ahead of it; the debit never before the day itself.
    const after2 = r({ attempts: 2, noticeQueuedAt: d('2026-12-01T05:00:00Z'), noticeSentAt: d('2026-12-01T05:00:00Z'), lastFailedAt: d('2026-12-02T07:00:00Z') }, failed)
    expect(renewalStep(after2, d('2026-12-03T03:00:00Z'), true)).toEqual({ kind: 'notice', debitAt: d('2026-12-04T04:00:00Z') })
    const early = r({ attempts: 2, noticeQueuedAt: d('2026-12-02T08:00:00Z'), noticeSentAt: d('2026-12-02T08:00:00Z'), lastFailedAt: d('2026-12-02T07:00:00Z') }, failed)
    expect(renewalStep(early, d('2026-12-03T10:00:00Z'), true).kind).toBe('wait')
    expect(renewalStep(early, d('2026-12-04T04:00:00Z'), true)).toEqual({ kind: 'debit', attempt: 3 })
    expect(renewalStep(r({ attempts: 4 }, failed), d('2026-12-07T00:00:00Z'), true)).toEqual({ kind: 'wait', why: 'retries spent' })
    expect(renewalStep(r({ attempts: 4 }, failed), d('2026-12-08T04:00:00Z'), true)).toEqual({ kind: 'lapse' })
  })
  it('a cancelled seat, a suspended partner or no mandate ends at the period end; keys must match the seat', () => {
    expect(renewalStep(r({}, { cancelAt: d('2026-12-01T03:30:00Z') }), d('2026-12-01T03:30:00Z'), true)).toEqual({ kind: 'end' })
    expect(renewalStep(r({ partnerLive: false }), d('2026-11-30T12:00:00Z'), true).kind).toBe('wait')
    expect(renewalStep(r({ partnerLive: false }), d('2026-12-01T04:00:00Z'), true)).toEqual({ kind: 'end' })
    expect(renewalStep(r(), d('2026-11-30T02:30:00Z'), false).kind).toBe('wait')
    expect(renewalStep(r({ testMode: false }), d('2026-11-30T02:30:00Z'), true)).toEqual({ kind: 'wait', why: 'a real seat is never debited with test keys' })
    expect(renewalStep(r({ testMode: false }), d('2026-11-30T02:30:00Z'), false).kind).toBe('notice')
  })
  it('never two attempts at once; never a retry without a failure', () => {
    expect(renewalStep(r({ pending: 1 }), d('2026-12-01T04:00:00Z'), true)).toEqual({ kind: 'wait', why: 'an attempt is not settled yet' })
    expect(renewalStep(r({ attempts: 1 }), d('2026-12-02T04:00:00Z'), true)).toEqual({ kind: 'wait', why: 'a retry without a recorded failure' })
  })
  it('a card waits 37 h after its notice', () => {
    const card = r({ method: 'card', noticeQueuedAt: d('2026-11-29T14:00:00Z'), noticeSentAt: d('2026-11-29T14:45:00Z') })
    expect(renewalStep(card, d('2026-12-01T03:30:00Z'), true).kind).toBe('wait')
    expect(renewalStep(card, d('2026-12-01T04:00:00Z'), true)).toEqual({ kind: 'debit', attempt: 1 })
  })
})
