import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { razorpayEventKey, verifyRazorpaySignature } from '../razorpay'

const secret = 'test_secret'
const body = '{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_1"}}}}'
const sign = (s: string) => createHmac('sha256', secret).update(s).digest('hex')

describe('verifyRazorpaySignature', () => {
  it('accepts the raw body it was signed over', () => {
    expect(verifyRazorpaySignature(body, sign(body), secret)).toBe(true)
  })
  it('refuses a body re-serialised with different bytes', () => {
    const reformatted = JSON.stringify(JSON.parse(body), null, 2)
    expect(verifyRazorpaySignature(reformatted, sign(body), secret)).toBe(false)
  })
  it('refuses with no secret configured', () => {
    expect(verifyRazorpaySignature(body, sign(body), '')).toBe(false)
  })
})

describe('razorpayEventKey', () => {
  it('keys on event and object', () => {
    expect(razorpayEventKey(JSON.parse(body))).toBe('razorpay:payment.captured:pay_1')
  })
  it('refuses an event with no object', () => {
    expect(razorpayEventKey({ event: 'payment.captured' })).toBeNull()
  })
})
