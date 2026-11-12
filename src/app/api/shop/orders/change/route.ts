import { z } from 'zod'
import { OrderRef, orderRefHash } from '@/lib/http/order-ref'
import { LIMITS } from '@/lib/db/rate-limit'
import { reply, shopRequest } from '@/lib/http/shop-api'
import { editReplyEvent, startEditPayment } from '@/lib/orders/edit-paid'
import { processEvents, storeRazorpayEvent } from '@/lib/orders/payment'
import { drainSoon } from '@/lib/outbox/drain'

// Cost guardrails G·1 (scripts/check-duration.mjs): a route stops at its limit, never Vercel's 300 s.
export const maxDuration = 30

// "Pay ₹N for the changes" on the shopper's order page (order edit OE·2): `start` opens Razorpay Checkout on the shop's own
// key against the change's second Razorpay order (made once, reused); the signed reply is checked with OUR stored second
// order id, stored first as a captured event, then applied like every capture (processEvents → edit-capture.ts). The order
// by the checkout's token or an email's link (OrderRef), as /pay.
const Body = z.intersection(OrderRef, z.union([
  z.object({ start: z.literal(true) }),
  z.object({ paymentId: z.string().regex(/^pay_[A-Za-z0-9]{6,40}$/), signature: z.string().regex(/^[a-f0-9]{64}$/) }),
]))

export async function POST(request: Request) {
  const r = await shopRequest(request, Body, LIMITS.payIp)
  if (!r.ok) return r.response
  const hash = await orderRefHash(r.tenantId, r.body)
  if (!hash) return reply({ error: 'Not found' }, 404)
  if ('start' in r.body) {
    const out = await startEditPayment(r.tenantId, hash)
    return out.ok ? reply({ pay: out.pay }) : reply({ error: out.error }, out.status)
  }
  const ev = await editReplyEvent(r.tenantId, hash, { paymentId: r.body.paymentId, signature: r.body.signature })
  if (!ev) return reply({ error: 'We could not confirm this payment. If money left your account, the shop will see it within minutes.' }, 400)
  await storeRazorpayEvent(r.tenantId, ev.key, ev.payload)
  await processEvents(r.tenantId).catch(() => 0)
  drainSoon()
  return reply({ ok: true })
}
