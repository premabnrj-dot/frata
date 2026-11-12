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
export type RzpPayment = { id: string; status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed'; amount: number; currency: string | null; fee: number | null; tax: number | null; method: string | null }

/** A failure carries Razorpay's status and, for the refund calls to sort it into our codes, its description (never
 * stored or logged: it can quote a shopper). */
type Call = { ok: true; json: Record<string, unknown> } | { ok: false; status: number; said?: string }

async function call(k: Keys, method: 'GET' | 'POST', path: string, body?: object, headers: Record<string, string> = {}): Promise<Call> {
  try {
    const r = await fetchWithTimeout(`${RAZORPAY_API_BASE}${path}`, {
      method, headers: { authorization: 'Basic ' + Buffer.from(`${k.keyId}:${k.keySecret}`).toString('base64'), 'content-type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined, cache: 'no-store',
    }, RAZORPAY_TIMEOUT_MS)
    if (!r.ok) {
      const said = await r.json().then((j: { error?: { description?: unknown } }) => (typeof j?.error?.description === 'string' ? j.error.description : ''), () => '')
      return { ok: false, status: r.status, said }
    }
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
  if (!r.ok) return { ok: false, status: r.status }
  const id = r.json.id
  return typeof id === 'string' && id.startsWith('order_') ? { ok: true, id } : { ok: false, status: 502 }
}

/** The payments made against a Razorpay order (to see a late capture before switching to COD). A failure carries
 * Razorpay's status (0: unreachable), so the caller can tell refused keys apart (noteKeysAnswer). */
export async function orderPayments(k: Keys, rzpOrderId: string): Promise<{ ok: true; items: RzpPayment[] } | { ok: false; status: number }> {
  if (!/^order_[A-Za-z0-9]{6,40}$/.test(rzpOrderId)) return { ok: false, status: 400 }
  const r = await call(k, 'GET', `/v1/orders/${rzpOrderId}/payments`)
  if (!r.ok) return { ok: false, status: r.status }
  const items = Array.isArray(r.json.items) ? (r.json.items as Record<string, unknown>[]) : []
  return { ok: true, items: items.map(toPayment) }
}

export function toPayment(p: Record<string, unknown>): RzpPayment {
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null)
  return { id: String(p.id ?? ''), status: String(p.status ?? 'failed') as RzpPayment['status'], amount: n(p.amount) ?? 0, currency: typeof p.currency === 'string' ? p.currency : null, fee: n(p.fee), tax: n(p.tax), method: typeof p.method === 'string' ? p.method : null }
}

/** Checkout's reply is genuine: hmac_sha256(OUR order id + "|" + payment id, key secret), compared in constant time. */
export function checkoutSignatureOk(ourRzpOrderId: string, paymentId: string, signature: string, keySecret: string): boolean {
  if (!signature || !paymentId) return false
  const expected = createHmac('sha256', keySecret).update(`${ourRzpOrderId}|${paymentId}`).digest('hex')
  const a = Buffer.from(expected), b = Buffer.from(signature)
  return a.length === b.length && timingSafeEqual(a, b)
}

// ── Refunds and second orders (order edit OE·2; frata-integrations § Razorpay, refunds rechecked 2026-11-12) ──

const PAY_ID = /^pay_[A-Za-z0-9]{6,40}$/
export type RzpRefund = { id: string; amount: number; receipt: string | null; status: 'pending' | 'processed' | 'failed' }
const toRefund = (x: Record<string, unknown>): RzpRefund => ({ id: String(x.id ?? ''), amount: typeof x.amount === 'number' ? x.amount : 0, receipt: typeof x.receipt === 'string' ? x.receipt : null,
  status: x.status === 'processed' ? 'processed' : x.status === 'failed' ? 'failed' : 'pending' })

/** One payment: what it captured, its state and when it was made (the 6-month refund limit). */
export async function fetchPayment(k: Keys, paymentId: string): Promise<{ ok: true; amount: number; status: string; createdAt: Date } | { ok: false; status: number }> {
  if (!PAY_ID.test(paymentId)) return { ok: false, status: 400 }
  const r = await call(k, 'GET', `/v1/payments/${paymentId}`)
  if (!r.ok) return { ok: false, status: r.status }
  const at = typeof r.json.created_at === 'number' ? new Date(r.json.created_at * 1000) : new Date(0)
  return { ok: true, amount: typeof r.json.amount === 'number' ? r.json.amount : 0, status: String(r.json.status ?? ''), createdAt: at }
}

/** Every refund on one payment (listed before each create: the idempotency key's retention is not documented). */
export async function paymentRefunds(k: Keys, paymentId: string): Promise<{ ok: true; items: RzpRefund[] } | { ok: false; status: number }> {
  if (!PAY_ID.test(paymentId)) return { ok: false, status: 400 }
  const r = await call(k, 'GET', `/v1/payments/${paymentId}/refunds?count=100`)
  if (!r.ok) return { ok: false, status: r.status }
  return { ok: true, items: (Array.isArray(r.json.items) ? (r.json.items as Record<string, unknown>[]) : []).map(toRefund) }
}

export type RefundRefusal = 'busy' | 'balance' | 'too_old' | 'disabled' | 'over' | 'keys' | 'refused' | 'unreachable'
/** Razorpay's refusal as our code: words it may use, matched loosely; anything else is a plain refusal. */
export function refusalOf(status: number, said = ''): RefundRefusal {
  if (status === 0 || status >= 500) return 'unreachable'
  if (status === 401 || status === 403) return 'keys'
  if (status === 409 || /another .*operation.* in progress/i.test(said)) return 'busy'
  if (/enough balance|insufficient (account )?balance|low balance/i.test(said)) return 'balance'
  if (/6 months|six months|older than|too old/i.test(said)) return 'too_old'
  if (/exceed|greater than|more than|fully refunded|already been refunded/i.test(said)) return 'over'
  if (/not (supported|enabled|allowed)|disabled|turned off/i.test(said)) return 'disabled'
  return 'refused'
}

/**
 * A normal-speed refund, always (the dashboard's Default Refund Speed is the API's default; Instant costs the merchant),
 * with our attempt id as its receipt and as `X-Refund-Idempotency` (same key, same body: a safe retry).
 */
export async function createRefund(k: Keys, paymentId: string, r: { amount: number; attemptId: string; notes: Record<string, string> }): Promise<{ ok: true; refund: RzpRefund } | { ok: false; why: RefundRefusal }> {
  if (!PAY_ID.test(paymentId)) return { ok: false, why: 'refused' }
  const res = await call(k, 'POST', `/v1/payments/${paymentId}/refund`, { amount: r.amount, speed: 'normal', receipt: r.attemptId, notes: r.notes }, { 'X-Refund-Idempotency': r.attemptId })
  if (!res.ok) return { ok: false, why: refusalOf(res.status, res.said) }
  return { ok: true, refund: toRefund(res.json) }
}

/** One refund's state now (the `refund.check` sender reads it back; refund webhooks are optional). */
export async function fetchRefund(k: Keys, paymentId: string, refundId: string): Promise<{ ok: true; refund: RzpRefund } | { ok: false; status: number }> {
  if (!PAY_ID.test(paymentId) || !/^rfnd_[A-Za-z0-9]{6,40}$/.test(refundId)) return { ok: false, status: 400 }
  const r = await call(k, 'GET', `/v1/payments/${paymentId}/refunds/${refundId}`)
  if (!r.ok) return { ok: false, status: r.status }
  return { ok: true, refund: toRefund(r.json) }
}

/** The order made earlier under this receipt (a receipt is unique per account: a retry reuses it). */
export async function orderByReceipt(k: Keys, receipt: string): Promise<{ ok: true; id: string | null; amount: number | null } | { ok: false; status: number }> {
  const want = receipt.slice(0, 40)
  const r = await call(k, 'GET', `/v1/orders?receipt=${encodeURIComponent(want)}`)
  if (!r.ok) return { ok: false, status: r.status }
  const o = (Array.isArray(r.json.items) ? (r.json.items as Record<string, unknown>[]) : []).find((x) => x.receipt === want)
  return { ok: true, id: typeof o?.id === 'string' && o.id.startsWith('order_') ? o.id : null, amount: typeof o?.amount === 'number' ? o.amount : null }
}
