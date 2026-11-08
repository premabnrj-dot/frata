import { after, NextResponse } from 'next/server'
import { webhookSigned } from '@/lib/billing/gateway'
import { applyBillingEvent, storeBillingEvent } from '@/lib/db/platform'
import { errName } from '@/lib/log'

// ENTRY POINT credential: Frrata's OWN billing webhook secret (current or previous), HMAC of the raw body
// (scripts/check-actions.mjs; plan finding 12). Separate from the shops' Razorpay webhooks. A 256 kB cap before anything
// is read; the event is stored once under the gateway's event id with a trimmed payload, answered at once, then applied
// from the stored row. Status only moves forward (app_apply_billing_event).
export const dynamic = 'force-dynamic'
const LIMIT = 256 * 1024
const KEEP = new Set(['payment.captured', 'payment.failed', 'token.cancelled', 'token.rejected', 'token.paused', 'token.confirmed'])

type Event = { event?: string; created_at?: number; payload?: { payment?: { entity?: Record<string, unknown> }; token?: { entity?: Record<string, unknown> } } }

/** Only what applying needs: ids, status, the order and the bank's reason. Nothing about the payer. */
function trimmed(e: Event) {
  const p = e.payload?.payment?.entity, t = e.payload?.token?.entity
  const pick = (o: Record<string, unknown> | undefined, keys: string[]) => (o ? Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, typeof o[k] === 'string' ? String(o[k]).slice(0, 160) : o[k]])) : undefined)
  return { event: e.event, payload: { ...(p ? { payment: { entity: pick(p, ['id', 'order_id', 'status', 'amount', 'error_description']) } } : {}), ...(t ? { token: { entity: pick(t, ['id', 'status']) } } : {}) } }
}

export async function POST(request: Request) {
  if (Number(request.headers.get('content-length') ?? 0) > LIMIT) return NextResponse.json({ error: 'too large' }, { status: 413 })
  const raw = await request.text()
  if (raw.length > LIMIT) return NextResponse.json({ error: 'too large' }, { status: 413 })
  if (!webhookSigned(raw, request.headers.get('x-razorpay-signature') ?? '')) return NextResponse.json({ error: 'bad signature' }, { status: 401 })
  let e: Event
  try { e = JSON.parse(raw) as Event } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }
  if (!e.event || !KEEP.has(e.event)) return NextResponse.json({ ignored: true })
  // OUR key for the event: Razorpay's id header when sent, else the type, the entity id and the time.
  const entityId = String(e.payload?.payment?.entity?.id ?? e.payload?.token?.entity?.id ?? '')
  const eventId = (request.headers.get('x-razorpay-event-id') ?? `${e.event}:${entityId}:${e.created_at ?? ''}`).slice(0, 80)
  if (!/^[A-Za-z0-9_.:-]{3,80}$/.test(eventId)) return NextResponse.json({ error: 'bad event' }, { status: 400 })
  const id = await storeBillingEvent(eventId, e.event, trimmed(e))
  if (id) after(() => applyBillingEvent(id).then(() => undefined, (err) => console.error('[billing webhook] apply', errName(err))))
  return NextResponse.json({ ok: true })
}
