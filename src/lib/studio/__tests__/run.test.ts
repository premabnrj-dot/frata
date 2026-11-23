import { beforeEach, describe, expect, it, vi } from 'vitest'

// The hourly run (C1·3, C1·6) with the gateway, mail and definers mocked: a debit is claimed before the request and
// never sent twice; a refund is claimed before the request; stragglers are settled by the gateway's answer or closed
// when nothing was taken; a renewal's order carries Razorpay's notification; emails go to the owner (and a Lead).

vi.mock('server-only', () => ({}))
vi.mock('@/lib/env', () => ({ EMAIL_NOTICES_FROM: 'Frrata <n@frrata.test>', SES_CONFIG_NOTICES: 'cfg', isEmailConfigured: () => true, VERCEL_ENV: '' }))
vi.mock('@/lib/public-env', () => ({ CONSOLE_HOST: 'app.frrata.test' }))
const gw = vi.hoisted(() => ({
  orderPayments: vi.fn(async () => ({ items: [] as Record<string, unknown>[] })), orderByReceipt: vi.fn(async () => null as null | { id: string }),
  chargeRecurring: vi.fn(async () => ({ razorpay_payment_id: 'pay_r1' })), fetchPayment: vi.fn(async () => ({ id: 'pay_r1', status: 'captured', amount: 353882, currency: 'INR' })),
  createRenewalOrder: vi.fn(async () => ({ id: 'order_ren0001' })), refundPayment: vi.fn(async () => ({ id: 'rfnd_1', status: 'processed' })), cancelToken: vi.fn(async () => undefined),
  paymentRefunds: vi.fn(async () => ({ items: [] as { id: string; amount: number; status: string }[] })),
}))
vi.mock('@/lib/billing/gateway', () => ({ ...gw, isBillingGatewayConfigured: () => true, billingGatewayIsTest: () => true }))
vi.mock('@/lib/billing/seller', () => ({ frrataSeller: () => ({ name: 'Frrata', gstin: null, address: 'Jaipur', sac: '998315', test: true, prefix: 'FRR/', fy: '26-27' }) }))
const sent = vi.hoisted(() => [] as { to: string; subject: string; text: string }[])
vi.mock('@/lib/email/ses', () => ({ sendEmail: vi.fn(async (m: { to: string; subject: string; text: string }) => { sent.push(m); return { ok: true } }) }))
const sys = vi.hoisted(() => ({
  unsettled: vi.fn(async () => [] as unknown[]), apply: vi.fn(async () => 'applied'), close: vi.fn(async () => true),
  renewals: vi.fn(async () => [] as unknown[]), renewalBegin: vi.fn(async () => 'r1'), seatEnd: vi.fn(async () => true),
  ctx: vi.fn(async () => ({ id: 'r1', orderId: 'order_ren0001', customerId: 'cust_1', tokenId: 'token_1', open: true, claimed: false, total: 353882, receipt: 'pc_r1', debitAfter: new Date(Date.now() - 1000) })),
  claim: vi.fn(async () => true), renewalsNotified: vi.fn(async () => [] as unknown[]), setOrder: vi.fn(async () => true),
  refundsDue: vi.fn(async () => [] as unknown[]), refundClaim: vi.fn(async () => true), refundDone: vi.fn(async () => undefined),
  tokenCancels: vi.fn(async () => [] as unknown[]), tokenCancelled: vi.fn(async () => undefined),
  noticesClaim: vi.fn(async () => [] as unknown[]), noticeDone: vi.fn(async () => undefined),
}))
vi.mock('@/lib/db/partner-credits', () => ({ system: sys }))
vi.mock('@/lib/db/platform', () => ({ billingUnapplied: vi.fn(async () => []), applyBillingEvent: vi.fn(async () => undefined) }))

const later = () => Date.now() + 60_000
const seat = (o: Record<string, unknown> = {}) => ({ seatId: 's1', partnerId: 'p', plan: 'studio', nextPlan: null, method: 'upi', test: true, periodEnd: new Date('2026-12-01T03:30:00Z'),
  cancelAt: null, failedAt: null, attempts: 0, pending: 0, purchaseId: null, purchaseOpen: false, hasOrder: false, noticeQueuedAt: null, noticeSentAt: null, lastFailedAt: null,
  mandate: true, mandateMax: 360000, partnerLive: true, ...o })

beforeEach(() => { vi.clearAllMocks(); sent.length = 0 })

describe('the hourly run', async () => {
  const { runCredits } = await import('../run')
  it('a renewal near its end: the attempt and its notice, at the frozen price', async () => {
    sys.renewals.mockResolvedValueOnce([seat()])
    const r = await runCredits(new Date('2026-11-30T03:00:00Z'), later())
    expect(r.notices).toBe(1)
    expect(sys.renewalBegin).toHaveBeenCalledWith(expect.objectContaining({ seatId: 's1', attempt: 1, plan: 'studio', credits: 150, taxable: 299900 }))
  })
  it('a plan change waits for the renewal; a mandate too small for it ends the seat at the period end', async () => {
    sys.renewals.mockResolvedValueOnce([seat({ nextPlan: 'plus' })])
    await runCredits(new Date('2026-11-30T03:00:00Z'), later())
    expect(sys.renewalBegin).not.toHaveBeenCalled()
    sys.renewals.mockResolvedValueOnce([seat({ nextPlan: 'plus' })])
    const r = await runCredits(new Date('2026-12-01T04:00:00Z'), later())
    expect(sys.seatEnd).toHaveBeenCalledWith('s1', false)
    expect(r.ended).toBe(1)
  })
  it('a debit: claimed before the request, once; the gateway’s answer applied', async () => {
    const row = seat({ attempts: 0, purchaseId: 'r1', purchaseOpen: true, hasOrder: true, noticeQueuedAt: new Date('2026-11-30T02:30:00Z'), noticeSentAt: new Date('2026-11-30T02:31:00Z') })
    sys.renewals.mockResolvedValueOnce([row])
    const r = await runCredits(new Date('2026-12-01T04:00:00Z'), later())
    expect(r.debits).toBe(1)
    expect(sys.claim.mock.invocationCallOrder[0]!).toBeLessThan(gw.chargeRecurring.mock.invocationCallOrder[0]!)
    expect(sys.apply).toHaveBeenCalledWith(expect.objectContaining({ order: 'order_ren0001', payment: 'pay_r1', captured: true, amount: 353882 }))
    sys.renewals.mockResolvedValueOnce([row]); sys.claim.mockResolvedValueOnce(false)
    await runCredits(new Date('2026-12-01T04:00:00Z'), later())
    expect(gw.chargeRecurring).toHaveBeenCalledTimes(1)
  })
  it('a debit already on the order is never charged again', async () => {
    sys.renewals.mockResolvedValueOnce([seat({ purchaseId: 'r1', purchaseOpen: true, hasOrder: true, noticeQueuedAt: new Date('2026-11-30T02:30:00Z'), noticeSentAt: new Date('2026-11-30T02:31:00Z') })])
    gw.orderPayments.mockResolvedValueOnce({ items: [{ id: 'pay_x', status: 'created' }] })
    await runCredits(new Date('2026-12-01T04:00:00Z'), later())
    expect(gw.chargeRecurring).not.toHaveBeenCalled()
  })
  it('a renewal whose email went gets its order with Razorpay’s notification; its clock starts then', async () => {
    const after = new Date('2026-12-01T03:30:00Z')
    sys.renewalsNotified.mockResolvedValueOnce([{ id: 'r1', receipt: 'pc_r1', total: 353882, customerId: 'cust_1', tokenId: 'token_1', debitAfter: after }])
    const r = await runCredits(new Date('2026-11-30T03:00:00Z'), later())
    expect(gw.createRenewalOrder).toHaveBeenCalledWith({ amount: 353882, receipt: 'pc_r1', token: 'token_1', paymentAfter: after })
    expect(sys.setOrder).toHaveBeenCalledWith('r1', 'order_ren0001', true)
    expect(r.orders).toBe(1)
  })
  it('stragglers: applied from the gateway, or closed after a day with nothing taken', async () => {
    sys.unsettled.mockResolvedValueOnce([{ id: 'a', receipt: 'pc_a', orderId: 'order_a000001', kind: 'pack', claimed: false, createdAt: new Date('2026-11-22T00:00:00Z') },
      { id: 'b', receipt: 'pc_b', orderId: 'order_b000001', kind: 'pack', claimed: false, createdAt: new Date('2026-11-20T00:00:00Z') }])
    gw.orderPayments.mockResolvedValueOnce({ items: [{ id: 'pay_a', status: 'captured', amount: 235882, currency: 'INR' }] }).mockResolvedValueOnce({ items: [] })
    const r = await runCredits(new Date('2026-11-22T06:00:00Z'), later())
    expect(sys.apply).toHaveBeenCalledWith(expect.objectContaining({ order: 'order_a000001', payment: 'pay_a', captured: true }))
    expect(sys.close).toHaveBeenCalledWith('b', 'Not paid. Nothing was charged.')
    expect(r.settled).toBe(2)
  })
  it('refunds: claimed before the request; a test refund never with live keys', async () => {
    sys.refundsDue.mockResolvedValueOnce([{ id: 'x', paymentId: 'pay_x', amount: 999, test: true, claimed: false }, { id: 'y', paymentId: 'pay_y', amount: 999, test: false, claimed: false }])
    const r = await runCredits(new Date(), later())
    expect(sys.refundClaim).toHaveBeenCalledTimes(1)
    expect(sys.refundClaim.mock.invocationCallOrder[0]!).toBeLessThan(gw.refundPayment.mock.invocationCallOrder[0]!)
    expect(sys.refundDone).toHaveBeenCalledWith('x', 'rfnd_1')
    expect(r.refunds).toBe(1)
  })
  it('a refund claimed earlier is looked up first: found, recorded and never sent again; absent, sent', async () => {
    sys.refundsDue.mockResolvedValueOnce([{ id: 'x', paymentId: 'pay_x', amount: 999, test: true, claimed: true }])
    gw.paymentRefunds.mockResolvedValueOnce({ items: [{ id: 'rfnd_old', amount: 999, status: 'processed' }] })
    await runCredits(new Date(), later())
    expect(gw.refundPayment).not.toHaveBeenCalled()
    expect(sys.refundDone).toHaveBeenCalledWith('x', 'rfnd_old')
    sys.refundsDue.mockResolvedValueOnce([{ id: 'x', paymentId: 'pay_x', amount: 999, test: true, claimed: true }])
    await runCredits(new Date(), later())
    expect(sys.refundClaim).not.toHaveBeenCalled()
    expect(gw.refundPayment).toHaveBeenCalledWith('pay_x', 999)
  })
  it('a refund that fails stays claimed for the next hour’s look-up', async () => {
    sys.refundsDue.mockResolvedValueOnce([{ id: 'x', paymentId: 'pay_x', amount: 999, test: true, claimed: false }])
    gw.refundPayment.mockRejectedValueOnce(new Error('timeout'))
    const r = await runCredits(new Date(), later())
    expect(r.refunds).toBe(0)
    expect(sys.refundDone).not.toHaveBeenCalled()
  })
  it('emails: the owner gets the owner’s words, a Lead the Lead’s; the pre-debit notice names amount, day, time and mandate', async () => {
    sys.noticesClaim.mockResolvedValueOnce([
      { id: 'n1', kind: 'budget_80', partnerId: 'p', owners: ['g@nook.test'], leads: ['e@nook.test'], ownerName: 'Kabir Shah', data: { client: 'House of Ayuda', used: 240, budget: 300 } },
      { id: 'n2', kind: 'predebit', partnerId: 'p', owners: ['g@nook.test'], leads: [], ownerName: 'Kabir', data: { total: 353882, debitAfter: '2026-12-01T03:30:00Z', plan: 'studio', method: 'upi', mandateRef: '4821', forPeriodEnd: '2026-12-01T03:30:00Z' } },
    ])
    const r = await runCredits(new Date(), later())
    expect(r.emails).toBe(2)
    const owner = sent.find((m) => m.to === 'g@nook.test' && m.subject.includes('80%'))!, lead = sent.find((m) => m.to === 'e@nook.test')!
    expect(owner.text).toContain('Raise the budget to keep them going.')
    expect(lead.text).toContain('Ask Kabir to raise it.')
    const pre = sent.find((m) => m.subject.startsWith('₹3,538.82 for Studio on 1 Dec'))!
    expect(pre.text).toMatch(/We’ll take ₹3,538\.82 from UPI AutoPay ••••4821 on 1 Dec, after 9:00/)
    expect(sys.noticeDone).toHaveBeenCalledWith('n1', true, null)
  })
  it('stops at its deadline', async () => {
    sys.renewals.mockResolvedValueOnce([seat()])
    const r = await runCredits(new Date('2026-11-30T03:00:00Z'), Date.now() - 1)
    expect(r.notices).toBe(0)
  })
})
