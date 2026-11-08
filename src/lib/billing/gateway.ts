import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { RAZORPAY_API_BASE, RAZORPAY_BILLING_KEY_ID, RAZORPAY_BILLING_KEY_SECRET, RAZORPAY_BILLING_WEBHOOK_SECRET, RAZORPAY_BILLING_WEBHOOK_SECRET_PREVIOUS } from '@/lib/env'
import { fetchWithTimeout } from '@/lib/http/timeout'

// =============================================================================
// FILE: src/lib/billing/gateway.ts — FRRATA'S OWN RAZORPAY ACCOUNT, for billing merchants (billing B3; plan findings
// 13–15). The ONLY reader of the billing keys. Razorpay Recurring Payments (frata-integrations § Merchant billing,
// checked 2026-11-08): a customer, an authorisation order with a token (UPI Autopay, card or eNACH), then each month an
// order and a recurring payment Frrata starts. Every call goes through fetchWithTimeout; a timeout throws and the
// caller leaves the attempt UNKNOWN (never resent): the gateway or the webhook settles it.
// =============================================================================

export const isBillingGatewayConfigured = () => RAZORPAY_BILLING_KEY_ID !== '' && RAZORPAY_BILLING_KEY_SECRET !== ''
/** Test keys move no money: only they may collect a test-mode invoice, and only live keys a real one. */
export const billingGatewayIsTest = () => RAZORPAY_BILLING_KEY_ID.startsWith('rzp_test_')
/** The key id Checkout opens with (public by design). */
export const billingKeyId = () => RAZORPAY_BILLING_KEY_ID

export class GatewayError extends Error { constructor(readonly status: number, message: string) { super(message) } }

async function api<T>(method: 'GET' | 'POST', path: string, body?: object): Promise<T> {
  const res = await fetchWithTimeout(`${RAZORPAY_API_BASE}${path}`, {
    method, headers: { authorization: 'Basic ' + Buffer.from(`${RAZORPAY_BILLING_KEY_ID}:${RAZORPAY_BILLING_KEY_SECRET}`).toString('base64'), 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, redirect: 'error',
  }, 15_000)
  const json = (await res.json().catch(() => ({}))) as T & { error?: { description?: string } }
  if (!res.ok) throw new GatewayError(res.status, (json.error?.description ?? `gateway ${res.status}`).slice(0, 160))
  return json
}

export type Method = 'upi' | 'card' | 'emandate'
type Order = { id: string; amount: number; receipt: string; status: string }
type Payment = { id: string; status: string; order_id: string; token_id?: string; error_description?: string }

export const createCustomer = (c: { name: string; email: string; contact: string }) =>
  api<{ id: string }>('POST', '/v1/customers', { ...c, fail_existing: '0' })

/** The authorisation order Checkout opens for an autopay set-up: ₹1 for UPI and card (refunded by the bank rules), ₹0 for eNACH. */
export const createMandateOrder = (o: { customer: string; method: Method; maxAmount: number; receipt: string }) =>
  api<Order>('POST', '/v1/orders', { amount: o.method === 'emandate' ? 0 : 100, currency: 'INR', customer_id: o.customer, method: o.method, payment_capture: 1, receipt: o.receipt,
    token: { max_amount: o.maxAmount, expire_at: Math.floor(Date.now() / 1000) + 10 * 365 * 86_400, frequency: 'as_presented' } })

export const fetchPayment = (id: string) => api<Payment>('GET', `/v1/payments/${encodeURIComponent(id)}`)
export const orderPayments = (order: string) => api<{ items: Payment[] }>('GET', `/v1/orders/${encodeURIComponent(order)}/payments`)
/** Before creating an order for an attempt, look for one already made for its receipt (a retry after a timeout). */
export const orderByReceipt = async (receipt: string) => (await api<{ items: Order[] }>('GET', `/v1/orders?receipt=${encodeURIComponent(receipt)}`)).items[0] ?? null
export const createOrder = (o: { amount: number; receipt: string }) => api<Order>('POST', '/v1/orders', { amount: o.amount, currency: 'INR', receipt: o.receipt, payment_capture: 1 })

export const chargeRecurring = (c: { order: string; customer: string; token: string; amount: number; description: string }) =>
  api<{ razorpay_payment_id: string; status?: string }>('POST', '/v1/payments/create/recurring',
    { order_id: c.order, customer_id: c.customer, token: c.token, amount: c.amount, currency: 'INR', recurring: '1', description: c.description, email: 'billing@frrata.app', contact: '9000000000' })

const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y) }
const hmac = (secret: string, data: string) => createHmac('sha256', secret).update(data).digest('hex')

/** Checkout's signature over "order|payment" with the key secret (plan finding 14: trust no browser). */
export const checkoutSigned = (order: string, payment: string, signature: string) =>
  isBillingGatewayConfigured() && /^[a-f0-9]{64}$/.test(signature) && same(hmac(RAZORPAY_BILLING_KEY_SECRET, `${order}|${payment}`), signature)

/** The webhook's signature over the raw body; the current and the previous secret both pass during a rotation. */
export const webhookSigned = (raw: string, signature: string) =>
  /^[a-f0-9]{64}$/.test(signature) && [RAZORPAY_BILLING_WEBHOOK_SECRET, RAZORPAY_BILLING_WEBHOOK_SECRET_PREVIOUS].some((s) => s !== '' && same(hmac(s, raw), signature))
