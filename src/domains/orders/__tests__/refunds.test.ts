import { describe, expect, it } from 'vitest'
import { paidLeft, refundDue } from '../amounts'
import { canRetry, chainLength, dueOf, feeAbout, feeKept, paidNet, refundable, refundChains, refundLine, refundStage, settleOf, tooOldToRefund, type RefundRow } from '../refunds'

const now = new Date('2026-11-12T10:00:00Z')
const at = (days: number) => new Date(now.getTime() - days * 86_400_000)
const none = { cancelledAt: null, sendingAt: null, sentAt: null, processedAt: null, failedAt: null }
const row = (o: Partial<RefundRow>): RefundRow => ({ id: 'r', razorpayPaymentId: 'pay_A', amount: 100, failure: null, retryOf: null, notBefore: now, ...none, ...o })

describe('a paid order\'s money after an edit (OE·2)', () => {
  it('derives an attempt\'s stage from its moments; only failed and cancelled ones give the money back', () => {
    expect(refundStage(none)).toBe('queued')
    expect(refundStage({ ...none, sendingAt: now })).toBe('sending')
    expect(refundStage({ ...none, sendingAt: now, sentAt: now })).toBe('sent')
    expect(refundStage({ ...none, sendingAt: now, sentAt: now, processedAt: now })).toBe('processed')
    expect(refundStage({ ...none, cancelledAt: now })).toBe('cancelled')
    expect(refundStage({ ...none, sendingAt: now, sentAt: now, failedAt: now })).toBe('failed')
    const pays = [{ id: 'pay_A', amount: 428000, at: at(1) }]
    const rs = [row({ amount: 100000 }), row({ amount: 50000, cancelledAt: now }), row({ amount: 20000, failedAt: now, failure: 'balance' }), row({ amount: 30000, sendingAt: now, sentAt: now, processedAt: now })]
    expect(refundable(pays, rs).get('pay_A')).toBe(428000 - 100000 - 30000)
    expect(paidNet(pays, rs)).toBe(298000)
  })

  it('lower by ₹1 or more refunds the difference; higher asks for it first; within ₹1 nothing moves', () => {
    const paid = { payments: [{ id: 'pay_A', amount: 428000, at: at(3) }], refunds: [] }
    expect(settleOf(238100, paid, now)).toEqual({ kind: 'refund', amount: 189900, parts: [{ paymentId: 'pay_A', amount: 189900 }] })
    expect(settleOf(477900, paid, now)).toEqual({ kind: 'ask', amount: 49900 })
    expect(settleOf(428050, paid, now)).toEqual({ kind: 'absorb', amount: 50 })
    expect(settleOf(427950, paid, now)).toEqual({ kind: 'absorb', amount: -50 })
    expect(settleOf(428000, paid, now)).toEqual({ kind: 'none' })
    expect(settleOf(100, null, now)).toEqual({ kind: 'none' })
    expect(dueOf(settleOf(238100, paid, now))).toBe(189900)
    expect(dueOf(settleOf(477900, paid, now))).toBe(-49900)
  })

  it('splits a refund over the payments, newest first, never one 6 months old, never a part under ₹1', () => {
    const two = { payments: [{ id: 'pay_A', amount: 238100, at: at(10) }, { id: 'pay_B', amount: 49900, at: at(2) }], refunds: [] }
    expect(settleOf(194900, two, now)).toEqual({ kind: 'refund', amount: 93100, parts: [{ paymentId: 'pay_B', amount: 49900 }, { paymentId: 'pay_A', amount: 43200 }] })
    // The newest would leave 50 paise for the older one: it keeps back enough to leave it ₹1.
    expect(settleOf(288000 - 49950, two, now)).toEqual({ kind: 'refund', amount: 49950, parts: [{ paymentId: 'pay_B', amount: 49850 }, { paymentId: 'pay_A', amount: 100 }] })
    const old = { payments: [{ id: 'pay_A', amount: 238100, at: at(200) }, { id: 'pay_B', amount: 49900, at: at(2) }], refunds: [] }
    expect(settleOf(260000, old, now)).toEqual({ kind: 'refund', amount: 28000, parts: [{ paymentId: 'pay_B', amount: 28000 }] })
    expect(settleOf(194900, old, now)).toEqual({ kind: 'too_old', amount: 93100 })
    // A payment already part refunded gives only what it has left.
    const part = { payments: [{ id: 'pay_A', amount: 428000, at: at(1) }], refunds: [row({ amount: 189900, sendingAt: now, sentAt: now })] }
    expect(settleOf(138100, part, now)).toEqual({ kind: 'refund', amount: 100000, parts: [{ paymentId: 'pay_A', amount: 100000 }] })
  })

  it('6 months, a day short to be safe', () => {
    const paidAt = new Date('2026-05-12T10:00:00Z')
    expect(tooOldToRefund(paidAt, new Date('2026-11-10T09:00:00Z'))).toBe(false)
    expect(tooOldToRefund(paidAt, new Date('2026-11-11T10:00:00Z'))).toBe(true)
  })

  it('shows each chain of attempts as its latest; counts automatic retries', () => {
    const a = row({ id: 'a', failedAt: now, failure: 'failed', sendingAt: now, sentAt: now }), b = row({ id: 'b', retryOf: 'a' }), c = row({ id: 'c', cancelledAt: now })
    expect(refundChains([a, b, c]).map((r) => r.id)).toEqual(['b'])
    expect(chainLength([a, b], b)).toBe(2)
  })

  it('words a refund on the order page', () => {
    expect(refundLine({ ...none, cause: 'edit', failure: null }, 'at 10:52')).toEqual({ words: 'refund · sends at 10:52', failed: null })
    expect(refundLine({ ...none, sendingAt: now, cause: 'edit', failure: null }, '').words).toBe('refund · with Razorpay')
    expect(refundLine({ ...none, sendingAt: now, sentAt: now, processedAt: now, cause: 'after_drop', failure: null }, '').words).toBe('refunded · 5–10 working days to reach the shopper · paid after the change was dropped')
    expect(refundLine({ ...none, failedAt: now, cause: 'edit', failure: 'balance' }, '')).toEqual({ words: 'not sent', failed: 'Not enough balance in Razorpay: add funds, then try again.' })
  })

  it('Try again: never for one a later change settled, a payment too old or one already refunded elsewhere', () => {
    expect(canRetry({ failure: 'balance' })).toBe(true)
    expect(canRetry({ failure: 'balance', supersededBy: 'e2' })).toBe(false)
    expect(canRetry({ failure: 'too_old' })).toBe(false)
    expect(canRetry({ failure: 'over' })).toBe(false)
    expect(canRetry({ failure: null })).toBe(false)
    const a = row({ id: 'a', failedAt: now, failure: 'balance', supersededBy: 'e2' })
    expect(refundChains([a])).toEqual([])
  })

  it('what Razorpay keeps of its fee on the refunded part; about what it keeps on a payment refunded in full', () => {
    const pays = [{ id: 'pay_A', amount: 428000, at: at(1), fee: 10101 }, { id: 'pay_B', amount: 49900, at: at(1), fee: 1180 }]
    expect(feeKept([{ paymentId: 'pay_A', amount: 189900 }], pays)).toEqual({ kept: Math.round((10101 * 189900) / 428000), fee: 10101 })
    expect(feeKept([{ paymentId: 'pay_B', amount: 49900 }, { paymentId: 'pay_A', amount: 1000 }], pays)).toEqual({ kept: 1180 + Math.round(10101 * 1000 / 428000), fee: 11281 })
    expect(feeKept([{ paymentId: 'pay_A', amount: 1000 }], [{ id: 'pay_A', amount: 428000, at: at(1), fee: null }])).toBeNull()
    expect(feeAbout(49900, pays[1]!)).toBe(1180)
    expect(feeAbout(49900, null)).toBe(998 + 180)
    expect(refundLine({ ...none, sendingAt: now, cause: 'after_drop', failure: null, gatewayFee: 1180 }, '', (p) => `₹${p / 100}`).words).toBe('refund · with Razorpay · paid after the change was dropped · Razorpay kept ₹11.8')
  })

  it('a cancel refunds what the payments still hold (impact review BLOCKER)', () => {
    const o = { paidAt: now, cancelledAt: now, onlineTotal: 481200, total: 243100 } as unknown as Parameters<typeof refundDue>[0]
    const ledger = { payments: [{ id: 'pay_A', amount: 481200, at: now }], refunds: [row({ amount: 238100 })] }
    expect(paidLeft(o, null)).toBe(481200)
    expect(paidLeft(o, ledger)).toBe(243100)
    expect(refundDue(o, ledger)).toBe(243100)
    expect(refundDue({ ...o, cancelledAt: null } as typeof o, ledger)).toBe(0)
  })
})
