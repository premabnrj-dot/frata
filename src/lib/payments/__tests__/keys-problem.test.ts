// Razorpay refusing a shop's keys shows on Settings ("Needs attention") and clears once a call works (2026-11-12).
import { describe, expect, it } from 'vitest'
import { KEYS_REFUSED, problemAfter, refusedKeys } from '../keys'

describe('the keys problem a Razorpay answer leaves', () => {
  it('401 and 403 are refused keys; Razorpay down (0, 5xx) or a bad request is not', () => {
    expect([401, 403].map(refusedKeys)).toEqual([true, true])
    expect([0, 400, 404, 429, 500, 502].map(refusedKeys)).toEqual([false, false, false, false, false, false])
  })
  it('refused → the problem, once; a call that works clears it; nothing else writes', () => {
    expect(problemAfter(null, { ok: false, status: 401 })).toBe(KEYS_REFUSED)
    expect(problemAfter(KEYS_REFUSED, { ok: false, status: 403 })).toBeUndefined()
    expect(problemAfter(KEYS_REFUSED, { ok: true })).toBeNull()
    expect(problemAfter(null, { ok: true })).toBeUndefined()
    expect(problemAfter(null, { ok: false, status: 0 })).toBeUndefined()
    // Another problem is not a payment call's to clear.
    expect(problemAfter('Something else', { ok: true })).toBeUndefined()
  })
})
