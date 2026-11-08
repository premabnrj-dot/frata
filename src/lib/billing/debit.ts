import 'server-only'
import { billingAttemptContext, billingAttemptOrder, billingAttemptResult } from '@/lib/db/platform'
import type { OutboxRow } from '@/lib/outbox'
import { billingGatewayIsTest, chargeRecurring, createOrder, fetchPayment, orderByReceipt, orderPayments } from './gateway'

// =============================================================================
// FILE: src/lib/billing/debit.ts — THE OUTBOX SENDER FOR 'bill:attempt' (billing B3; plan finding 13). One attempt = one
// payment row = one gateway order (receipt "<invoice number>:<attempt>", looked up before another is made). Before
// charging, the order's payments are read: if one exists, its outcome is recorded and nothing is charged again. A
// timeout throws: the outbox retries the row, and the retry finds the payment by its order — never a double charge.
// =============================================================================

export async function sendBillAttempt(row: OutboxRow): Promise<void> {
  const paymentId = (row.payload as { payment?: string }).payment
  if (!paymentId || !/^[0-9a-f-]{36}$/.test(paymentId)) throw new Error('bill:attempt without a payment')
  const ctx = await billingAttemptContext(paymentId)
  if (!ctx) return // settled already (by the webhook, or an earlier try)
  if (ctx.testMode !== billingGatewayIsTest()) throw new Error(ctx.testMode ? 'a test invoice is never collected with live keys' : 'a real invoice is never collected with test keys')
  if (!ctx.customer || !ctx.token) throw new Error('autopay is not set up for this shop')
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
}
