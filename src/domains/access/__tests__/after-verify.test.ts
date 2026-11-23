import { describe, expect, it } from 'vitest'
import { RESEND_SECONDS, afterVerify, resendWait } from '../email-code'

describe('afterVerify: where the page goes once a code is right (O1·8b)', () => {
  it('sign-up stays on its page and goes on to the next question', () => expect(afterVerify('/start')).toBe('stay'))
  it('the partner workspace and a team invite get a full page load (their own policy)', () => {
    expect(afterVerify('/partner')).toBe('assign')
    expect(afterVerify('/join')).toBe('assign')
  })
  it('anything else is a client move', () => {
    for (const to of ['/console', '/admin', '/choose', '/handover', '/partners/apply']) expect(afterVerify(to)).toBe('replace')
  })
})

describe('resendWait', () => {
  it('counts down from RESEND_SECONDS, never below 0; nothing sent is 0', () => {
    expect(RESEND_SECONDS).toBe(60)
    expect(resendWait(null, 5_000)).toBe(0)
    expect(resendWait(1_000, 1_000)).toBe(60)
    expect(resendWait(1_000, 31_900)).toBe(30)
    expect(resendWait(1_000, 61_000)).toBe(0)
    expect(resendWait(1_000, 999_000)).toBe(0)
  })
})
