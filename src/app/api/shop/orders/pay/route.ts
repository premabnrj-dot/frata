import { z } from 'zod'
import { LIMITS } from '@/lib/db/rate-limit'
import { reply, shopRequest, Token } from '@/lib/http/shop-api'
import { confirmPayment, paymentFailed, processEvents } from '@/lib/orders/payment'
import { drainSoon } from '@/lib/outbox/drain'

// Razorpay Checkout's reply in the browser: paid (signed) or failed. The order is found by its link token only.
const Body = z.union([
  z.object({ token: Token, paymentId: z.string().regex(/^pay_[A-Za-z0-9]{6,40}$/), signature: z.string().regex(/^[a-f0-9]{64}$/) }),
  z.object({ token: Token, failed: z.literal(true) }),
])

export async function POST(request: Request) {
  const r = await shopRequest(request, Body, LIMITS.payIp)
  if (!r.ok) return r.response
  if ('failed' in r.body) { await paymentFailed(r.tenantId, r.body.token); return reply({ ok: true }) }
  const out = await confirmPayment(r.tenantId, r.body.token, { paymentId: r.body.paymentId, signature: r.body.signature })
  await processEvents(r.tenantId).catch(() => 0)
  if (out.ok) drainSoon() // "Order confirmed" (email E·2)
  return out.ok ? reply({ ok: true }) : reply({ error: out.error }, out.status)
}
