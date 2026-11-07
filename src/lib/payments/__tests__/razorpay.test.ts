import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/env', () => ({ RAZORPAY_API_BASE: 'http://rzp.invalid' }))
const { checkoutSignatureOk, modeOf, toPayment } = await import('../razorpay')

describe('razorpay', () => {
  it('accepts only a signature made with OUR order id', () => {
    const sig = createHmac('sha256', 'sek').update('order_A1|pay_9').digest('hex')
    expect(checkoutSignatureOk('order_A1', 'pay_9', sig, 'sek')).toBe(true)
    expect(checkoutSignatureOk('order_B2', 'pay_9', sig, 'sek')).toBe(false)
    expect(checkoutSignatureOk('order_A1', 'pay_9', sig, 'other')).toBe(false)
    expect(checkoutSignatureOk('order_A1', 'pay_9', '', 'sek')).toBe(false)
  })
  it('reads the mode from the key prefix', () => {
    expect(modeOf('rzp_test_Abc123XYZ')).toBe('test')
    expect(modeOf('rzp_live_Abc123XYZ')).toBe('live')
    expect(modeOf('rzp_live_')).toBeNull()
    expect(modeOf('pk_live_abc123')).toBeNull()
  })
  it('reads a payment entity defensively', () => {
    expect(toPayment({ id: 'pay_1', status: 'captured', amount: 249000, fee: 5876, tax: 896 })).toEqual({ id: 'pay_1', status: 'captured', amount: 249000, fee: 5876, tax: 896, method: null })
  })
})
