import { describe, expect, it } from 'vitest'
import { refusalOf } from '../razorpay'

// Razorpay's refund refusals as our codes (frata-integrations § Razorpay, refunds 2026-11-12): never Razorpay's words on a
// row (they can quote a shopper), and the code decides what happens next (wait, retry, or the merchant acts).
describe('refusalOf', () => {
  it('sorts Razorpay\'s answers into our codes', () => {
    expect(refusalOf(0)).toBe('unreachable')
    expect(refusalOf(502)).toBe('unreachable')
    expect(refusalOf(401)).toBe('keys')
    expect(refusalOf(403, 'anything')).toBe('keys')
    expect(refusalOf(409)).toBe('busy')
    expect(refusalOf(400, 'Another payment operation is in progress')).toBe('busy')
    expect(refusalOf(400, 'The merchant does not have enough balance to process the refund')).toBe('balance')
    expect(refusalOf(400, 'Insufficient balance')).toBe('balance')
    expect(refusalOf(400, 'Refund is not allowed on payments older than 6 months')).toBe('too_old')
    expect(refusalOf(400, 'The refund amount provided is greater than amount captured')).toBe('over')
    expect(refusalOf(400, 'The payment has been fully refunded already')).toBe('over')
    expect(refusalOf(400, 'Refunds are disabled for this account')).toBe('disabled')
    expect(refusalOf(400, 'Partial refund not supported for this method')).toBe('disabled')
    expect(refusalOf(400, 'Something else')).toBe('refused')
    expect(refusalOf(400)).toBe('refused')
  })
})
