import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { fetchWithTimeout } from '@/lib/http/timeout'
import { RAZORPAY_API_BASE } from '@/lib/env'

// =============================================================================
// FILE: src/lib/payments/razorpay.ts
//
// THE MERCHANT'S OWN RAZORPAY ACCOUNT, called with their keys (Basic auth).
// Facts (frata-integrations, checked 2026-11-07): orders in paise, receipt ≤ 40
// chars, per-order capture settings override the dashboard; the Checkout
// signature is hmac(OUR order id | payment id, key secret). The one
// synchronous outbound call in checkout (ADR-0006 amendment): the order row
// exists first and nothing commits on the reply. Bodies and keys are never logged.
// =============================================================================

export const RAZORPAY_TIMEOUT_MS = 8_000
export type Keys = { keyId: string; keySecret: string }
export type RzpPayment = { id: string; status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed'; amount: number; fee: number | null; tax: number | null; method: string | null }

type Call = { ok: true; json: Record<string, unknown> } | { ok: false; status: number }

async function call(k: Keys, method: 'GET' | 'POST', path: string, body?: object): Promise<Call> {
  try {
    const r = await fetchWithTimeout(`${RAZORPAY_API_BASE}${path}`, {
      method, headers: { authorization: 'Basic ' + Buffer.from(`${k.keyId}:${k.keySecret}`).toString('base64'), 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined, cache: 'no-store',
    }, RAZORPAY_TIMEOUT_MS)
    if (!r.ok) return { ok: false, status: r.status }
    return { ok: true, json: (await r.json()) as Record<string, unknown> }
  } catch {
    return { ok: false, status: 0 }
  }
}

export const modeOf = (keyId: string): 'test' | 'live' | null => (/^rzp_test_[A-Za-z0-9]{6,40}$/.test(keyId) ? 'test' : /^rzp_live_[A-Za-z0-9]{6,40}$/.test(keyId) ? 'live' : null)

/** A read-only call that proves the pair works. "wrong": Razorpay refused the keys; "unreachable": try again later. */
export async function checkKeys(k: Keys): Promise<'ok' | 'wrong' | 'unreachable'> {
  const r = await call(k, 'GET', '/v1/payments?count=1')
  if (r.ok) return 'ok'
  return r.status === 401 || r.status === 400 ? 'wrong' : 'unreachable'
}

/** A Razorpay order for one of our orders. Capture is automatic per order, whatever the dashboard says. */
export async function createOrder(k: Keys, o: { amount: number; receipt: string; notes: Record<string, string> }): Promise<{ ok: true; id: string } | { ok: false; status: number }> {
  const r = await call(k, 'POST', '/v1/orders', {
    amount: o.amount, currency: 'INR', receipt: o.receipt.slice(0, 40), notes: o.notes,
    payment: { capture: 'automatic', capture_options: { automatic_expiry_period: 30, refund_speed: 'normal' } },
  })
  if (!r.ok) return r
  const id = r.json.id
  return typeof id === 'string' && id.startsWith('order_') ? { ok: true, id } : { ok: false, status: 502 }
}

/** The payments made against a Razorpay order (to see a late capture before switching to COD). */
export async function orderPayments(k: Keys, rzpOrderId: string): Promise<RzpPayment[] | null> {
  if (!/^order_[A-Za-z0-9]{6,40}$/.test(rzpOrderId)) return null
  const r = await call(k, 'GET', `/v1/orders/${rzpOrderId}/payments`)
  if (!r.ok) return null
  const items = Array.isArray(r.json.items) ? (r.json.items as Record<string, unknown>[]) : []
  return items.map(toPayment)
}

export function toPayment(p: Record<string, unknown>): RzpPayment {
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null)
  return { id: String(p.id ?? ''), status: String(p.status ?? 'failed') as RzpPayment['status'], amount: n(p.amount) ?? 0, fee: n(p.fee), tax: n(p.tax), method: typeof p.method === 'string' ? p.method : null }
}

/** Checkout's reply is genuine: hmac_sha256(OUR order id + "|" + payment id, key secret), compared in constant time. */
export function checkoutSignatureOk(ourRzpOrderId: string, paymentId: string, signature: string, keySecret: string): boolean {
  if (!signature || !paymentId) return false
  const expected = createHmac('sha256', keySecret).update(`${ourRzpOrderId}|${paymentId}`).digest('hex')
  const a = Buffer.from(expected), b = Buffer.from(signature)
  return a.length === b.length && timingSafeEqual(a, b)
}
