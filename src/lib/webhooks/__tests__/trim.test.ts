import { describe, expect, it } from 'vitest'
import { trimRazorpayEvent } from '../razorpay'
import { isWebp } from '@/domains/media/sizes'
import { errName } from '@/lib/log'

describe('trimRazorpayEvent (security review S4)', () => {
  it('keeps the event and what reconciliation reads; drops the shopper', () => {
    const ev = { event: 'payment.captured', account_id: 'acc_1', payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1', amount: 129900, currency: 'INR', status: 'captured', method: 'upi', fee: 2598, tax: 396, email: 's@x.in', contact: '+919829043210', vpa: 's@okaxis', card: { last4: '4242' }, notes: { a: 1 } } } } }
    expect(trimRazorpayEvent(ev)).toEqual({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1', amount: 129900, currency: 'INR', status: 'captured', method: 'upi', fee: 2598, tax: 396 } } } })
  })
  it('an event with no payment keeps only its name', () => { expect(trimRazorpayEvent({ event: 'order.paid', payload: { order: { entity: { id: 'o' } } } })).toEqual({ event: 'order.paid' }) })
})

describe('isWebp (security review S11)', () => {
  const b = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)))
  it('reads the RIFF…WEBP header', () => { expect(isWebp(b('RIFF\0\0\0\0WEBP'))).toBe(true) })
  it('refuses HTML, PNG and short files', () => { expect(isWebp(b('<html><body>'))).toBe(false); expect(isWebp(b('\x89PNG\r\n\x1a\n\0\0\0\0'))).toBe(false); expect(isWebp(b('RIFF'))).toBe(false) })
})

describe('errName (security review S10)', () => {
  it('never carries the query or its parameters', () => {
    const err = Object.assign(new Error('Failed query: insert into tenants … params: riya@kesarstudio.in'), { cause: { code: '23505', constraint_name: 'tenants_slug_key', message: 'duplicate key value' } })
    expect(errName(err)).toBe('Error 23505 tenants_slug_key')
    expect(errName(err)).not.toMatch(/riya|params|query/)
    expect(errName('x')).toBe('string')
  })
})
