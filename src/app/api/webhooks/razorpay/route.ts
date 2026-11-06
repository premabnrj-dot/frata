import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { webhookEvents } from '@/lib/db/schema'
import { RAZORPAY_WEBHOOK_SECRET } from '@/lib/env'
import { razorpayEventKey, verifyRazorpaySignature } from '@/lib/webhooks/razorpay'

// ENTRY POINT credential: the Razorpay HMAC signature (scripts/check-actions.mjs).
// Store, answer, process later — Razorpay waits ~5 s and retries for 24 h.
export async function POST(request: Request) {
  const raw = await request.text()
  if (!verifyRazorpaySignature(raw, request.headers.get('x-razorpay-signature'), RAZORPAY_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 })
  }
  let event: unknown
  try {
    event = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 })
  }
  const key = razorpayEventKey(event as Parameters<typeof razorpayEventKey>[0])
  if (!key) return NextResponse.json({ ignored: true })

  await db().insert(webhookEvents)
    .values({ provider: 'razorpay', eventKey: key, payload: event as object })
    .onConflictDoNothing({ target: webhookEvents.eventKey })
  return NextResponse.json({ ok: true })
}
