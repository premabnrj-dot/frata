import { describe, expect, it } from 'vitest'
import { autopayStoppedPause, pauseWindow, checkTerms, daysUntil, endOfIstDayAfter, extendsAtHandover, lastDay, mayExtend, pausesAt, trialEndsAt, trialState, type TrialFacts, type TrialMoney } from '../trial'

// IST wall-clock moments (UTC+5:30).
const ist = (s: string) => new Date(`${s}+05:30`)
const base: TrialFacts = { days: 30, openWindowDays: 15, signedUpAt: ist('2026-11-08T10:00:00'), startedAt: null, extendedAt: null, endedAt: null }
const none: TrialMoney = { mandateActive: false, exposedAt: null }
const auto: TrialMoney = { mandateActive: true, exposedAt: null }

describe('checkTerms', () => {
  it('sign-ups 7–45 days, one shop up to 90, window 0–30', () => {
    expect(checkTerms({ days: 30, openWindowDays: 15 }).ok).toBe(true)
    expect(checkTerms({ days: 46, openWindowDays: 15 }).ok).toBe(false)
    expect(checkTerms({ days: 90, openWindowDays: 15 }, true).ok).toBe(true)
    expect(checkTerms({ days: 91, openWindowDays: 15 }, true).ok).toBe(false)
    expect(checkTerms({ days: 6, openWindowDays: 15 }).ok).toBe(false)
    expect(checkTerms({ days: 30, openWindowDays: 31 }).ok).toBe(false)
    expect(checkTerms({ days: 30.5, openWindowDays: 1 }).ok).toBe(false)
  })
})

describe('trialEndsAt (the one end; IST day ends)', () => {
  it('ends at the end of an IST day', () => {
    expect(endOfIstDayAfter(ist('2026-11-12T23:30:00'), 0)).toEqual(ist('2026-11-13T00:00:00'))
    expect(endOfIstDayAfter(ist('2026-11-12T00:10:00'), 30)).toEqual(ist('2026-12-13T00:00:00'))
  })
  it('building: provisional = sign-up + window + length', () => {
    expect(trialEndsAt(base)).toEqual(ist('2026-12-24T00:00:00')) // 8 Nov + 45 days → end of 23 Dec
  })
  it('live on 12 Nov: 30 days from going live → ends after 12 Dec (the mockup)', () => {
    const f = { ...base, startedAt: ist('2026-11-12T16:00:00') }
    expect(trialEndsAt(f)).toEqual(ist('2026-12-13T00:00:00'))
    expect(lastDay(trialEndsAt(f)).toISOString().slice(0, 10)).toBe('2026-12-12')
  })
  it('going live late never passes the cap', () => {
    expect(trialEndsAt({ ...base, startedAt: ist('2026-12-01T09:00:00') })).toEqual(ist('2026-12-24T00:00:00'))
  })
  it('a 90-day shop over a year end; the extension adds 7 days once; staff end-now wins when earlier', () => {
    const f = { ...base, days: 90, startedAt: ist('2026-11-12T16:00:00') }
    expect(trialEndsAt(f)).toEqual(ist('2027-02-11T00:00:00'))
    const x = { ...base, startedAt: ist('2026-11-12T16:00:00'), extendedAt: ist('2026-12-10T12:00:00') }
    expect(trialEndsAt(x)).toEqual(ist('2026-12-20T00:00:00'))
    expect(trialEndsAt({ ...x, endedAt: ist('2026-12-01T12:00:00') })).toEqual(ist('2026-12-01T12:00:00'))
  })
})

describe('trialState (derived)', () => {
  const live = { ...base, startedAt: ist('2026-11-12T16:00:00') } // ends 13 Dec 00:00
  it('building, trial, ending', () => {
    expect(trialState(ist('2026-11-09T10:00:00'), base, none)).toBe('building')
    expect(trialState(ist('2026-11-20T10:00:00'), live, none)).toBe('trial')
    expect(trialState(ist('2026-12-05T10:00:00'), live, none)).toBe('ending')
  })
  it('the window runs out while building: the clock started anyway', () => {
    expect(trialState(ist('2026-11-24T10:00:00'), base, none)).toBe('trial')
  })
  it('no autopay: 7 days of grace, then paused; with autopay: paid', () => {
    expect(trialState(ist('2026-12-14T10:00:00'), live, none)).toBe('grace')
    expect(pausesAt(trialEndsAt(live), none)).toEqual(ist('2026-12-20T00:00:00'))
    expect(trialState(ist('2026-12-20T00:00:00'), live, none)).toBe('paused')
    expect(trialState(ist('2026-12-14T10:00:00'), live, auto)).toBe('paid')
    expect(trialState(ist('2026-12-05T10:00:00'), live, auto)).toBe('ending')
  })
  it('fees past ₹2,000 without autopay start the grace early; autopay cancels it', () => {
    const exposed = { mandateActive: false, exposedAt: ist('2026-12-01T09:00:00') }
    expect(trialState(ist('2026-12-02T10:00:00'), live, exposed)).toBe('grace')
    expect(trialState(ist('2026-12-08T09:00:00'), live, exposed)).toBe('paused')
    expect(trialState(ist('2026-12-02T10:00:00'), live, { ...exposed, mandateActive: true })).toBe('trial') // 10.6 days left
  })
})

describe('extensions', () => {
  const live = { ...base, startedAt: ist('2026-11-12T16:00:00') }
  it('the owner may extend once, from "ending", under 3 delivered orders', () => {
    expect(mayExtend(ist('2026-11-20T10:00:00'), live, 0, none)).toBe(false)
    expect(mayExtend(ist('2026-12-05T10:00:00'), live, 2, none)).toBe(true)
    expect(mayExtend(ist('2026-12-05T10:00:00'), live, 3, none)).toBe(false)
    // Fees past ₹2,000 on 20 Nov bring the grace forward, but the extension still opens only 10 days before the end.
    expect(mayExtend(ist('2026-11-25T10:00:00'), live, 0, { mandateActive: false, exposedAt: ist('2026-11-20T10:00:00') })).toBe(false)
    expect(mayExtend(ist('2026-12-15T10:00:00'), { ...live, extendedAt: ist('2026-12-05T10:00:00') }, 0, none)).toBe(false)
  })
  it('handover with under 7 days left extends automatically', () => {
    expect(extendsAtHandover(ist('2026-12-08T10:00:00'), live)).toBe(true)
    expect(extendsAtHandover(ist('2026-11-20T10:00:00'), live)).toBe(false)
  })
  it('days left counts a part day as a day', () => {
    expect(daysUntil(ist('2026-12-12T18:00:00'), trialEndsAt(live))).toBe(1)
    expect(daysUntil(ist('2026-12-14T18:00:00'), trialEndsAt(live))).toBe(0)
  })
})

describe('pauseWindow (no plan charge while paused)', () => {
  const live = { ...base, startedAt: ist('2026-11-12T16:00:00') } // pauses 20 Dec 00:00 without autopay
  it('autopay before the pause: never paused; after it: paused until autopay; none: still paused', () => {
    expect(pauseWindow(live, ist('2026-12-01T10:00:00'), null)).toBeNull()
    expect(pauseWindow(live, ist('2026-12-22T10:00:00'), null)).toEqual({ from: ist('2026-12-20T00:00:00'), to: ist('2026-12-22T10:00:00') })
    expect(pauseWindow(live, null, null)).toEqual({ from: ist('2026-12-20T00:00:00'), to: null })
    expect(pauseWindow(live, ist('2026-12-01T10:00:00'), ist('2027-01-10T10:00:00'))).toEqual({ from: ist('2027-01-17T10:00:00'), to: null })
  })
})

describe('autopayStoppedPause (any shop; owner 2026-11-08)', () => {
  it('7 days after autopay stopped; never while it runs', () => {
    expect(autopayStoppedPause(null)).toBeNull()
    expect(autopayStoppedPause(ist('2027-02-01T10:00:00'))).toEqual({ from: ist('2027-02-08T10:00:00'), to: null })
  })
})
