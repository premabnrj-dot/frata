import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The gateway calls Studio credits added (C1·3), against a stubbed fetch: what each sends is money-critical
// (impact review): a seat's monthly mandate and first debit, a renewal's notification in epoch seconds, a refund's
// amount, and a mandate cancelled by PUT, deleted only when the gateway says the token has no cancel (400).
vi.mock('server-only', () => ({}))
vi.mock('@/lib/env', () => ({ RAZORPAY_API_BASE: 'https://api.razorpay.test', RAZORPAY_BILLING_KEY_ID: 'rzp_test_x', RAZORPAY_BILLING_KEY_SECRET: 's',
  RAZORPAY_BILLING_WEBHOOK_SECRET: 'w', RAZORPAY_BILLING_WEBHOOK_SECRET_PREVIOUS: '' }))

const calls: { url: string; method: string; body: unknown }[] = []
let replies: { status: number; json: unknown }[] = []
beforeEach(() => {
  calls.length = 0; replies = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, method: String(init.method), body: init.body ? JSON.parse(String(init.body)) : undefined })
    const r = replies.shift() ?? { status: 200, json: { id: 'x' } }
    return new Response(JSON.stringify(r.json), { status: r.status, headers: { 'content-type': 'application/json' } })
  }))
})
afterEach(() => vi.unstubAllGlobals())

describe('the gateway for Studio credits', async () => {
  const g = await import('../gateway')
  it('a seat: the first month IS the authorisation, monthly, within the plan’s limit', async () => {
    await g.createSeatOrder({ customer: 'cust_1', method: 'upi', amount: 353882, maxAmount: 360000, receipt: 'pc_1' })
    expect(calls[0]).toMatchObject({ method: 'POST', url: 'https://api.razorpay.test/v1/orders' })
    expect(calls[0]!.body).toMatchObject({ amount: 353882, currency: 'INR', customer_id: 'cust_1', method: 'upi', receipt: 'pc_1', token: { max_amount: 360000, frequency: 'monthly' } })
  })
  it('a renewal order carries Razorpay’s notification, payment_after in epoch seconds', async () => {
    await g.createRenewalOrder({ amount: 353882, receipt: 'pc_2', token: 'token_1', paymentAfter: new Date('2026-12-01T03:30:00Z') })
    expect(calls[0]!.body).toEqual({ amount: 353882, currency: 'INR', receipt: 'pc_2', payment_capture: 1, notification: { token_id: 'token_1', payment_after: 1796095800 } })
  })
  it('a refund names its payment and amount; a payment’s refunds are listed', async () => {
    await g.refundPayment('pay_1', 999)
    expect(calls[0]).toMatchObject({ method: 'POST', url: 'https://api.razorpay.test/v1/payments/pay_1/refund', body: { amount: 999 } })
    await g.paymentRefunds('pay_1')
    expect(calls[1]).toMatchObject({ method: 'GET', url: 'https://api.razorpay.test/v1/payments/pay_1/refunds' })
  })
  it('a mandate is cancelled by PUT; DELETE only after a 400; any other failure is thrown', async () => {
    await g.cancelToken('cust_1', 'token_1')
    expect(calls.map((c) => c.method)).toEqual(['PUT'])
    expect(calls[0]!.url).toBe('https://api.razorpay.test/v1/customers/cust_1/tokens/token_1/cancel')
    calls.length = 0; replies = [{ status: 400, json: { error: { description: 'not a mandate' } } }, { status: 200, json: { deleted: true } }]
    await g.cancelToken('cust_1', 'token_2')
    expect(calls.map((c) => c.method)).toEqual(['PUT', 'DELETE'])
    calls.length = 0; replies = [{ status: 429, json: {} }]
    await expect(g.cancelToken('cust_1', 'token_3')).rejects.toThrow()
    expect(calls.map((c) => c.method)).toEqual(['PUT'])
  })
})
