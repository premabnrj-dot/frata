import { beforeEach, describe, expect, it, vi } from 'vitest'

// C1·3's server flow with the gateway and the definers mocked (the definers themselves are proven in tenancy.sql § 89):
// the refusals before anything is written; the attempt before the order; a retry reusing the order by receipt; the
// answer taken only from the gateway's payments on OUR order, never from the browser.

const env = vi.hoisted(() => ({ VERCEL_ENV: '' }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/env', () => env)
const gw = vi.hoisted(() => ({
  configured: true, test: true,
  createCustomer: vi.fn(async () => ({ id: 'cust_1' })), createOrder: vi.fn(async () => ({ id: 'order_new0001' })),
  createSeatOrder: vi.fn(async () => ({ id: 'order_seat001' })), orderByReceipt: vi.fn(async () => null as null | { id: string }),
  orderPayments: vi.fn(async () => ({ items: [] as { id: string; status: string; amount: number; currency: string; order_id: string; token_id?: string; error_description?: string }[] })),
}))
vi.mock('@/lib/billing/gateway', () => ({
  isBillingGatewayConfigured: () => gw.configured, billingGatewayIsTest: () => gw.test, billingKeyId: () => 'rzp_test_x',
  createCustomer: gw.createCustomer, createOrder: gw.createOrder, createSeatOrder: gw.createSeatOrder, orderByReceipt: gw.orderByReceipt, orderPayments: gw.orderPayments,
}))
const seller = vi.hoisted(() => ({ test: true }))
vi.mock('@/lib/billing/seller', () => ({ frrataSeller: () => ({ name: 'Frrata', gstin: seller.test ? null : '08AAACF0000A1Z5', address: 'Jaipur', sac: '998315', test: seller.test, prefix: 'FRR/', fy: '26-27' }) }))
const db = vi.hoisted(() => ({
  details: { legalName: 'Nook Studio LLP', gstin: null, stateCode: '27', address: 'Mumbai', email: null, gstinLocked: false } as null | Record<string, unknown>,
  begin: vi.fn(async () => ({ ok: true, value: { id: 'p1', receipt: 'pc_1', total: 235882 } })),
  setOrder: vi.fn(async () => true), setCustomer: vi.fn(async (_p: string, c: string) => c),
  ctx: vi.fn(async () => ({ id: 'p1', orderId: 'order_ours0001', customerId: null, open: true })),
  apply: vi.fn(async () => 'applied'), countConfirm: vi.fn(async () => ({ ok: true, value: undefined })),
}))
vi.mock('@/lib/db/partner-credits', () => ({
  payments: async () => ({ ok: true, value: { purchases: [{ id: 'p1' }], details: db.details, mandate: null } }),
  beginPurchase: db.begin, countConfirm: db.countConfirm,
  system: { setOrder: db.setOrder, setCustomer: db.setCustomer, ctx: db.ctx, apply: db.apply },
}))

const auth = { ok: true, userId: 'u', email: 'g@nook.test', sessionId: 's', stepup: 'h', confirmedAt: new Date(), partner: { email: 'g@nook.test', phone: '919845012345' } } as never
const caller = { userId: 'u', sessionId: 's', stepup: 'h' }

beforeEach(() => {
  vi.clearAllMocks(); env.VERCEL_ENV = ''; gw.configured = true; gw.test = true; seller.test = true
  db.details = { legalName: 'Nook Studio LLP', gstin: null, stateCode: '27', address: 'Mumbai', email: null, gstinLocked: false }
})

describe('starting a purchase', async () => {
  const { startPurchase } = await import('../purchase')
  it('refused before anything is written: no gateway, test keys on Production, live keys before a real seller', async () => {
    gw.configured = false
    expect(await startPurchase(auth, { kind: 'pack' })).toEqual({ ok: false, error: 'not_configured' })
    gw.configured = true; env.VERCEL_ENV = 'production'
    expect(await startPurchase(auth, { kind: 'pack' })).toEqual({ ok: false, error: 'test_keys' })
    env.VERCEL_ENV = ''; gw.test = false
    expect(await startPurchase(auth, { kind: 'pack' })).toEqual({ ok: false, error: 'seller' })
    expect(db.begin).not.toHaveBeenCalled()
  })
  it('invoice details first', async () => {
    db.details = { ...db.details!, stateCode: null }
    expect(await startPurchase(auth, { kind: 'pack' })).toEqual({ ok: false, error: 'details_first' })
    expect(db.begin).not.toHaveBeenCalled()
  })
  it('a pack: the attempt with its GST, then the order for its total, then the order stored', async () => {
    const r = await startPurchase(auth, { kind: 'pack' })
    expect(r).toMatchObject({ ok: true, order: 'order_new0001', purchaseId: 'p1', amount: 235882, recurring: false })
    expect(db.begin).toHaveBeenCalledWith(caller, expect.objectContaining({ kind: 'pack', credits: 100, taxable: 199900, igst: 35982, test: true, invoiceTest: true }))
    expect(gw.createOrder).toHaveBeenCalledWith({ amount: 235882, receipt: 'pc_1' })
    expect(db.setOrder).toHaveBeenCalledWith('p1', 'order_new0001', false)
    expect(db.begin.mock.invocationCallOrder[0]!).toBeLessThan(gw.createOrder.mock.invocationCallOrder[0]!)
  })
  it('a retry reuses the order found by receipt', async () => {
    gw.orderByReceipt.mockResolvedValueOnce({ id: 'order_old0001' })
    expect(await startPurchase(auth, { kind: 'pack' })).toMatchObject({ ok: true, order: 'order_old0001' })
    expect(gw.createOrder).not.toHaveBeenCalled()
  })
  it('Any amount out of 20–4,000 is refused', async () => {
    expect(await startPurchase(auth, { kind: 'credits', credits: 4_001 })).toEqual({ ok: false, error: 'bad_input' })
  })
  it('a seat: a customer, then an order whose amount is the first month, within the plan’s AutoPay limit', async () => {
    db.begin.mockResolvedValueOnce({ ok: true, value: { id: 'p2', receipt: 'pc_2', total: 353882 } })
    const r = await startPurchase(auth, { kind: 'seat', plan: 'studio' }, 'upi')
    expect(r).toMatchObject({ ok: true, order: 'order_seat001', customer: 'cust_1', recurring: true })
    expect(gw.createSeatOrder).toHaveBeenCalledWith({ customer: 'cust_1', method: 'upi', amount: 353882, maxAmount: 360000, receipt: 'pc_2' })
    expect(db.begin).toHaveBeenCalledWith(caller, expect.objectContaining({ kind: 'seat_start', plan: 'studio', method: 'upi', mandateMax: 360000 }))
  })
  it('a gateway failure leaves the attempt for the hourly run', async () => {
    gw.createOrder.mockRejectedValueOnce(new Error('timeout'))
    expect(await startPurchase(auth, { kind: 'pack' })).toEqual({ ok: false, error: 'gateway' })
    expect(db.setOrder).not.toHaveBeenCalled()
  })
})

describe('confirming after Checkout', async () => {
  const { confirmPurchase } = await import('../purchase')
  it('asks the gateway about OUR order and applies its captured payment', async () => {
    gw.orderPayments.mockResolvedValueOnce({ items: [{ id: 'pay_1', status: 'captured', amount: 235882, currency: 'INR', order_id: 'order_ours0001' }] })
    expect(await confirmPurchase(caller, 'p1')).toEqual({ ok: true, state: 'added' })
    expect(gw.orderPayments).toHaveBeenCalledWith('order_ours0001')
    expect(db.apply).toHaveBeenCalledWith(expect.objectContaining({ order: 'order_ours0001', payment: 'pay_1', captured: true, amount: 235882, test: true }))
  })
  it('nothing yet: waiting, nothing applied', async () => {
    expect(await confirmPurchase(caller, 'p1')).toEqual({ ok: true, state: 'waiting' })
    expect(db.apply).not.toHaveBeenCalled()
  })
  it('a declined payment', async () => {
    gw.orderPayments.mockResolvedValueOnce({ items: [{ id: 'pay_2', status: 'failed', amount: 235882, currency: 'INR', order_id: 'order_ours0001', error_description: 'declined' }] })
    db.apply.mockResolvedValueOnce('failed')
    expect(await confirmPurchase(caller, 'p1')).toEqual({ ok: true, state: 'declined' })
  })
  it('money that can’t buy (a changed amount, a second payment) is going back, never "waiting"', async () => {
    gw.orderPayments.mockResolvedValueOnce({ items: [{ id: 'pay_3', status: 'captured', amount: 999, currency: 'INR', order_id: 'order_ours0001' }] })
    db.apply.mockResolvedValueOnce('refund_due')
    expect(await confirmPurchase(caller, 'p1')).toEqual({ ok: true, state: 'refunding' })
  })
  it('another partner’s attempt is not found, and the gateway is never asked', async () => {
    expect(await confirmPurchase(caller, 'p-someone-else')).toEqual({ ok: false, error: 'not_found' })
    expect(gw.orderPayments).not.toHaveBeenCalled()
  })
  it('counted first; an attempt with no order is not found', async () => {
    db.countConfirm.mockResolvedValueOnce({ ok: false, error: 'too_many' } as never)
    expect(await confirmPurchase(caller, 'p1')).toEqual({ ok: false, error: 'too_many' })
    db.ctx.mockResolvedValueOnce({ id: 'p1', orderId: null, customerId: null, open: true } as never)
    expect(await confirmPurchase(caller, 'p1')).toEqual({ ok: false, error: 'not_found' })
  })
})
