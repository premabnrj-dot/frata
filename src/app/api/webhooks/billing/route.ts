import { createHash } from 'node:crypto'
import { after, NextResponse } from 'next/server'
import { billingGatewayIsTest, webhookSigned } from '@/lib/billing/gateway'
import { applyBillingEvent, storeBillingEvent } from '@/lib/db/platform'
import { errName } from '@/lib/log'

// Cost guardrails G·1 (scripts/check-duration.mjs): a route stops at its limit, never Vercel's 300 s.
export const maxDuration = 60

// ENTRY POINT credential: Frrata's OWN billing webhook secret (current or previous), HMAC of the raw body
// (scripts/check-actions.mjs; plan finding 12). Separate from the shops' Razorpay webhooks. A 256 kB cap before anything
// is read; the event is stored once under a hash of its signed body with a trimmed payload, answered at once, then applied
// from the stored row. Status only moves forward (app_apply_billing_event).
export const dynamic = 'force-dynamic'
const LIMIT = 256 * 1024
// Studio credits (C1, drizzle/0165) add a partner's refunds and disputes: credits bought with money that went back are
// clawed back. Merchant billing ignores both, as it ignored every type it didn't name.
const KEEP = new Set(['payment.captured', 'payment.failed', 'token.cancelled', 'token.rejected', 'token.paused', 'token.confirmed',
  'refund.processed', 'payment.dispute.created', 'payment.dispute.lost'])

type Event = { event?: string; created_at?: number; payload?: { payment?: { entity?: Record<string, unknown> }; token?: { entity?: Record<string, unknown> }; refund?: { entity?: Record<string, unknown> } } }

/** Only what applying needs: ids, status, the order, the mandate's token and the bank's reason. Nothing about the payer.
 *  `_test` is OURS, written here from the server's own keys (never read from the payload): a Studio credit payment is
 *  believed only in the mode its attempt was made in (C1, security M3). */
function trimmed(e: Event) {
  const p = e.payload?.payment?.entity, t = e.payload?.token?.entity, r = e.payload?.refund?.entity
  const pick = (o: Record<string, unknown> | undefined, keys: string[]) => (o ? Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, typeof o[k] === 'string' ? String(o[k]).slice(0, 160) : o[k]])) : undefined)
  return { event: e.event, _test: billingGatewayIsTest(), payload: {
    ...(p ? { payment: { entity: pick(p, ['id', 'order_id', 'status', 'amount', 'currency', 'error_description', 'token_id']) } } : {}),
    ...(t ? { token: { entity: pick(t, ['id', 'status']) } } : {}),
    ...(r ? { refund: { entity: pick(r, ['id', 'payment_id', 'amount']) } } : {}) } }
}

/** The body, read with a byte count: a chunked body with no length stops at the cap, never read whole first. */
async function capped(request: Request): Promise<string | null> {
  if (Number(request.headers.get('content-length') ?? 0) > LIMIT) return null
  if (!request.body) return ''
  const reader = request.body.getReader(), parts: Uint8Array[] = []
  let n = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    n += value.byteLength
    if (n > LIMIT) { await reader.cancel().catch(() => undefined); return null }
    parts.push(value)
  }
  return Buffer.concat(parts).toString('utf8')
}

export async function POST(request: Request) {
  const raw = await capped(request)
  if (raw === null) return NextResponse.json({ error: 'too large' }, { status: 413 })
  if (!webhookSigned(raw, request.headers.get('x-razorpay-signature') ?? '')) return NextResponse.json({ error: 'bad signature' }, { status: 401 })
  let e: Event
  try { e = JSON.parse(raw) as Event } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }
  if (!e.event || !KEEP.has(e.event)) return NextResponse.json({ ignored: true })
  // OUR key for the event: a hash of the SIGNED body (the id header is not signed, so a replay under a new id is the same
  // event). A redelivery is the same body; a new event differs in created_at at least.
  const eventId = `sha256:${createHash('sha256').update(raw).digest('hex').slice(0, 64)}`
  const id = await storeBillingEvent(eventId, e.event, trimmed(e))
  if (id) after(() => applyBillingEvent(id).then(() => undefined, (err) => console.error('[billing webhook] apply', errName(err))))
  return NextResponse.json({ ok: true })
}
