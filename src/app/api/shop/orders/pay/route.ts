import { z } from 'zod'
import { OrderRef, orderRefHash } from '@/lib/http/order-ref'
import { LIMITS } from '@/lib/db/rate-limit'
import { reply, shopRequest } from '@/lib/http/shop-api'
import { confirmPayment, paymentFailed, processEvents, releaseHold } from '@/lib/orders/payment'
import { drainSoon } from '@/lib/outbox/drain'

// Cost guardrails G·1 (scripts/check-duration.mjs): a route stops at its limit, never Vercel's 300 s.
export const maxDuration = 30

// Razorpay Checkout's reply in the browser: paid (signed), failed, or the sheet closed without paying (dismissed: the
// hold ends now, releaseHold). The order by the checkout's token or the "Finish paying" email's link (OrderRef), so its
// page can pay too.
const Body = z.intersection(OrderRef, z.union([
  z.object({ paymentId: z.string().regex(/^pay_[A-Za-z0-9]{6,40}$/), signature: z.string().regex(/^[a-f0-9]{64}$/) }),
  z.object({ failed: z.literal(true) }),
  z.object({ dismissed: z.literal(true) }),
]))

export async function POST(request: Request) {
  const r = await shopRequest(request, Body, LIMITS.payIp)
  if (!r.ok) return r.response
  const hash = await orderRefHash(r.tenantId, r.body)
  if (!hash) return reply({ error: 'Not found' }, 404)
  if ('failed' in r.body) { await paymentFailed(r.tenantId, hash); return reply({ ok: true }) }
  if ('dismissed' in r.body) {
    const out = await releaseHold(r.tenantId, hash)
    if (out === 'paid') drainSoon() // a capture found while asking: "Order confirmed" (email E·2)
    return reply({ ok: true, paid: out === 'paid' })
  }
  const out = await confirmPayment(r.tenantId, hash, { paymentId: r.body.paymentId, signature: r.body.signature })
  await processEvents(r.tenantId).catch(() => 0)
  if (out.ok) drainSoon() // "Order confirmed" (email E·2)
  return out.ok ? reply({ ok: true }) : reply({ error: out.error }, out.status)
}
