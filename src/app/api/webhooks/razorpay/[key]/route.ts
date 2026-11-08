import { after, NextResponse } from 'next/server'
import { webhookFor } from '@/lib/payments/keys'
import { processEvents, storeRazorpayEvent } from '@/lib/orders/payment'
import { RAZORPAY_BODY_LIMIT, razorpayEventKey, verifyRazorpaySignature } from '@/lib/webhooks/razorpay'

// ENTRY POINT credential: the shop's own webhook secret, found by the key in the URL (scripts/check-actions.mjs).
// The tenant comes from OUR key, never the payload (ADR-0006). Stored, answered inside Razorpay's 5 s, then
// processed at once in after() — a paid order must never wait for a daily cron (architecture review 2026-11-07).
export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  // A size cap before anything is read or looked up (security review S13).
  if (Number(request.headers.get('content-length') ?? 0) > RAZORPAY_BODY_LIMIT) return NextResponse.json({ error: 'too large' }, { status: 413 })
  const raw = await request.text()
  if (raw.length > RAZORPAY_BODY_LIMIT) return NextResponse.json({ error: 'too large' }, { status: 413 })
  const hook = await webhookFor((await params).key)
  if (!hook) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (!verifyRazorpaySignature(raw, request.headers.get('x-razorpay-signature'), hook.secret)) return NextResponse.json({ error: 'bad signature' }, { status: 401 })
  let event: unknown
  try { event = JSON.parse(raw) } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }
  const key = razorpayEventKey(event as Parameters<typeof razorpayEventKey>[0])
  if (!key) return NextResponse.json({ ignored: true })
  await storeRazorpayEvent(hook.tenantId, key, event as object)
  after(() => processEvents(hook.tenantId).then(() => undefined, (e) => console.error('[razorpay webhook] process', hook.tenantId, e instanceof Error ? e.name : 'error')))
  return NextResponse.json({ ok: true })
}
