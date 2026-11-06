import { createHmac, timingSafeEqual } from 'node:crypto'

// =============================================================================
// FILE: src/lib/webhooks/razorpay.ts
//
// Razorpay signs the RAW request bytes with HMAC-SHA256 (X-Razorpay-Signature).
// Verify the text exactly as received — re-serialising parsed JSON changes the
// bytes. Retries come for 24 h and Razorpay waits ~5 s, so the route stores the
// event and answers; the work happens later from webhook_events.
// =============================================================================

export function verifyRazorpaySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!secret || !signature) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(signature, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

type RazorpayEvent = {
  event?: string
  payload?: Record<string, { entity?: { id?: string } } | undefined>
}

/**
 * OUR idempotency key: provider, event type and the object it is about. Two
 * deliveries of the same payment.captured collapse to one row whatever the
 * provider's own delivery id says.
 */
export function razorpayEventKey(event: RazorpayEvent): string | null {
  if (!event.event) return null
  const entityName = event.event.split('.')[0] ?? ''
  const objectId = event.payload?.[entityName]?.entity?.id
  return objectId ? `razorpay:${event.event}:${objectId}` : null
}
