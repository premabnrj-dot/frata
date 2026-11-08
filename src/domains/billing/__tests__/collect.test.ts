import { describe, expect, it } from 'vitest'
import { nextStep, type DueInvoice } from '../collect'

const H = 3_600_000
const issued = new Date('2026-12-01T00:00:00Z')
const base: DueInvoice = { due: 180927, testMode: true, issuedAt: issued, mandate: true, mandateMax: 1_500_000, noticeAt: null, attempts: 0, pending: 0, lastFailedAt: null, acknowledged: false, trialEndsAt: null }
const at = (h: number) => new Date(issued.getTime() + h * H)

describe('collecting a due invoice (billing B3)', () => {
  it('notice first, the debit no sooner than 25 hours after it', () => {
    expect(nextStep(base, at(1), true)).toEqual({ kind: 'notice', debitAt: at(26) })
    const noticed = { ...base, noticeAt: at(1) }
    expect(nextStep(noticed, at(25.5), true).kind).toBe('wait')
    expect(nextStep(noticed, at(26), true)).toEqual({ kind: 'attempt', attempt: 1 })
  })
  it('never two unsettled attempts; never a test invoice with live keys, nor a real one with test keys', () => {
    expect(nextStep({ ...base, noticeAt: at(1), pending: 1 }, at(40), true).kind).toBe('wait')
    expect(nextStep(base, at(1), false)).toMatchObject({ kind: 'wait', why: expect.stringMatching(/live keys/) })
    expect(nextStep({ ...base, testMode: false }, at(1), true)).toMatchObject({ kind: 'wait', why: expect.stringMatching(/test keys/) })
  })
  it('after a failure: a new notice the next day, then the retry; at most 4 attempts; above the limit waits', () => {
    const failed = { ...base, noticeAt: at(1), attempts: 1, lastFailedAt: at(26) }
    expect(nextStep(failed, at(27), true)).toEqual({ kind: 'notice', debitAt: at(52) }) // the retry ≥ 25 h after the failure
    expect(nextStep({ ...failed, noticeAt: at(27) }, at(51), true).kind).toBe('wait')
    expect(nextStep({ ...failed, noticeAt: at(27) }, at(52), true)).toEqual({ kind: 'attempt', attempt: 2 })
    expect(nextStep({ ...failed, attempts: 4 }, at(100), true)).toMatchObject({ kind: 'wait', why: 'retries spent' })
    expect(nextStep({ ...base, due: 2_000_000 }, at(1), true)).toMatchObject({ kind: 'wait', why: 'above the autopay limit' })
  })
  it('on day 14 still unpaid (no autopay, or retries spent): one acknowledge-only notice; the shop never stops', () => {
    expect(nextStep({ ...base, mandate: false }, at(14 * 24 - 1), true).kind).toBe('wait')
    expect(nextStep({ ...base, mandate: false }, at(14 * 24), true)).toEqual({ kind: 'acknowledge' })
    expect(nextStep({ ...base, mandate: false, acknowledged: true }, at(20 * 24), true).kind).toBe('wait')
    expect(nextStep({ ...base, attempts: 4, lastFailedAt: at(100) }, at(15 * 24), false)).toEqual({ kind: 'acknowledge' })
  })
})

describe('nextStep during a trial (trials A2)', () => {
  const now = new Date('2026-12-05T10:00:00+05:30')
  const d = { due: 100000, testMode: true, issuedAt: new Date('2026-12-01T00:00:00+05:30'), mandate: true, mandateMax: 1_500_000, noticeAt: null, attempts: 0, pending: 0, lastFailedAt: null, acknowledged: false }
  it('waits while the trial runs; the notice goes 25 h before its end, so the debit lands after it', () => {
    expect(nextStep({ ...d, trialEndsAt: new Date('2026-12-13T00:00:00+05:30') }, now, true)).toEqual({ kind: 'wait', why: 'in a trial: collected after it ends' })
    expect(nextStep({ ...d, trialEndsAt: new Date('2026-12-06T00:00:00+05:30') }, now, true).kind).toBe('notice')
  })
  it('the day-14 note counts from the trial end when later than the invoice', () => {
    const late = { ...d, mandate: false, trialEndsAt: new Date('2026-12-13T00:00:00+05:30') }
    expect(nextStep(late, new Date('2026-12-20T00:00:00+05:30'), true).kind).toBe('wait')
    expect(nextStep(late, new Date('2026-12-27T00:00:00+05:30'), true).kind).toBe('acknowledge')
  })
})
