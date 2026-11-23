import { beforeEach, describe, expect, it, vi } from 'vitest'

// The billing webhook (C1, drizzle/0165; impact review 2026-11-23): the stored payload carries OUR `_test` (never the
// body's), the payment's token, and the refund's ids, which app_apply_billing_event reads to route a partner's payment.
const stored: { id: string; type: string; payload: Record<string, unknown> }[] = []
let testKeys = true
vi.mock('@/lib/billing/gateway', () => ({
  billingGatewayIsTest: () => testKeys,
  webhookSigned: (_raw: string, sig: string) => sig === 'good',
}))
vi.mock('@/lib/db/platform', () => ({
  storeBillingEvent: async (id: string, type: string, payload: Record<string, unknown>) => { stored.push({ id, type, payload }); return 'ev1' },
  applyBillingEvent: async () => undefined,
}))
vi.mock('@/lib/log', () => ({ errName: () => 'x' }))
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: () => undefined }))

const { POST } = await import('../route')
const post = (body: unknown, sig = 'good') => POST(new Request('https://x.test/api/webhooks/billing', { method: 'POST', body: JSON.stringify(body), headers: { 'x-razorpay-signature': sig } }))

describe('billing webhook', () => {
  beforeEach(() => { stored.length = 0; testKeys = true })

  it('writes our mode, never the body’s, with the payment’s token', async () => {
    const r = await post({ event: 'payment.captured', _test: false, created_at: 1, payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1', amount: 100, currency: 'INR', token_id: 'token_1', email: 'a@b.c', contact: '+91' } } } })
    expect(r.status).toBe(200)
    expect(stored[0]!.payload).toEqual({ event: 'payment.captured', _test: true, payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1', amount: 100, currency: 'INR', token_id: 'token_1' } } } })
    testKeys = false
    await post({ event: 'payment.captured', _test: true, created_at: 2, payload: { payment: { entity: { id: 'pay_2' } } } })
    expect(stored[1]!.payload._test).toBe(false)
  })

  it('keeps a refund’s ids and a dispute; drops what it doesn’t name', async () => {
    await post({ event: 'refund.processed', created_at: 3, payload: { refund: { entity: { id: 'rfnd_1', payment_id: 'pay_1', amount: 100, notes: { x: 1 } } }, payment: { entity: { id: 'pay_1', order_id: 'order_1' } } } })
    expect(stored[0]!.payload.payload).toEqual({ payment: { entity: { id: 'pay_1', order_id: 'order_1' } }, refund: { entity: { id: 'rfnd_1', payment_id: 'pay_1', amount: 100 } } })
    await post({ event: 'payment.dispute.created', created_at: 4, payload: { payment: { entity: { id: 'pay_1' } } } })
    expect(stored[1]!.type).toBe('payment.dispute.created')
    const r = await post({ event: 'order.paid', created_at: 5, payload: {} })
    expect(await r.json()).toEqual({ ignored: true })
    expect(stored).toHaveLength(2)
  })

  it('refuses a bad signature and stores nothing', async () => {
    const r = await post({ event: 'payment.captured', payload: {} }, 'bad')
    expect(r.status).toBe(401)
    expect(stored).toHaveLength(0)
  })
})
