import { after, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { webhookEvents } from '@/lib/db/schema'
import { webhookFor } from '@/lib/payments/keys'
import { processEvents } from '@/lib/orders/payment'
import { razorpayEventKey, verifyRazorpaySignature } from '@/lib/webhooks/razorpay'

// ENTRY POINT credential: the shop's own webhook secret, found by the key in the URL (scripts/check-actions.mjs).
// The tenant comes from OUR key, never the payload (ADR-0006). Stored, answered inside Razorpay's 5 s, then
// processed at once in after() — a paid order must never wait for a daily cron (architecture review 2026-11-07).
export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const raw = await request.text()
  const hook = await webhookFor((await params).key)
  if (!hook) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (!verifyRazorpaySignature(raw, request.headers.get('x-razorpay-signature'), hook.secret)) return NextResponse.json({ error: 'bad signature' }, { status: 401 })
  let event: unknown
  try { event = JSON.parse(raw) } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }
  const key = razorpayEventKey(event as Parameters<typeof razorpayEventKey>[0])
  if (!key) return NextResponse.json({ ignored: true })
  await db().insert(webhookEvents).values({ provider: 'razorpay', eventKey: `razorpay:${hook.tenantId}:${key.replace(/^razorpay:/, "")}`, tenantId: hook.tenantId, payload: event as object })
    .onConflictDoNothing({ target: webhookEvents.eventKey })
  after(() => processEvents(hook.tenantId).then(() => undefined, (e) => console.error('[razorpay webhook] process', hook.tenantId, e instanceof Error ? e.name : 'error')))
  return NextResponse.json({ ok: true })
}
