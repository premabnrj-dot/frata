import 'server-only'
import { billingAttemptContext, billingAttemptOrder, billingAttemptResult, claimBillingAttempt, closeBillingAttempt } from '@/lib/db/platform'
import { errName } from '@/lib/log'
import type { OutboxRow } from '@/lib/outbox'
import { billingGatewayIsTest, chargeRecurring, createOrder, fetchPayment, orderByReceipt, orderPayments } from './gateway'

// =============================================================================
// FILE: src/lib/billing/debit.ts — THE OUTBOX SENDER FOR 'bill:attempt' (billing B3; plan finding 13; security review
// 2026-11-08). One attempt = one payment row = one gateway order (receipt "<invoice number>:<attempt>"). A debit is
// NEVER resent: the sender first CLAIMS the attempt (drizzle/0060: once, ever); a second drain, an overlapping run or
// an outbox retry finds it claimed and charges nothing. Once claimed, nothing here throws (a throw would be retried):
// a timeout or an error leaves the attempt open, and the daily run settles it from the gateway after 2 hours, or
// closes it if no payment was ever made. Before charging, what is due NOW is checked: a credit note or a payment
// recorded since closes the attempt uncharged.
// =============================================================================

export async function sendBillAttempt(row: OutboxRow): Promise<void> {
  const paymentId = (row.payload as { payment?: string }).payment
  if (!paymentId || !/^[0-9a-f-]{36}$/.test(paymentId)) throw new Error('bill:attempt without a payment')
  const ctx = await billingAttemptContext(paymentId)
  if (!ctx || ctx.claimed) return // settled already, or a sender has it: never charged twice
  if (ctx.testMode !== billingGatewayIsTest()) throw new Error(ctx.testMode ? 'a test invoice is never collected with live keys' : 'a real invoice is never collected with test keys')
  if (!ctx.customer || !ctx.token) throw new Error('autopay is not set up for this shop')
  if (!(await claimBillingAttempt(paymentId))) return
  try {
    if (ctx.due < ctx.amount) { await closeBillingAttempt(paymentId, 'The amount due changed; a fresh notice follows'); return }
    const order = ctx.gatewayOrderId ?? (await orderByReceipt(ctx.receipt))?.id ?? (await createOrder({ amount: ctx.amount, receipt: ctx.receipt })).id
    if (!ctx.gatewayOrderId) await billingAttemptOrder(paymentId, order)
    // Already tried on this order? Record what the gateway says, charge nothing.
    const existing = (await orderPayments(order)).items
    const done = existing.find((p) => p.status === 'captured') ?? existing.find((p) => p.status === 'failed')
    if (done) { await billingAttemptResult(order, done.id, done.status === 'captured', done.error_description ?? null); return }
    if (existing.length) return // in flight: the webhook settles it
    const charged = await chargeRecurring({ order, customer: ctx.customer, token: ctx.token, amount: ctx.amount, description: `Frrata ${ctx.receipt.split(':')[0]}` })
    const p = await fetchPayment(charged.razorpay_payment_id).catch(() => null)
    if (p?.status === 'captured' || p?.status === 'failed') await billingAttemptResult(order, p.id, p.status === 'captured', p.error_description ?? null)
  } catch (e) {
    // Unknown outcome: never retried from here. The webhook or the 2-hour settle records what happened.
    console.error('[billing] debit', paymentId, errName(e))
  }
}
