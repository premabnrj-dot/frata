import { OrderRef, orderRefHash } from '@/lib/http/order-ref'
import { LIMITS } from '@/lib/db/rate-limit'
import { reply, shopRequest } from '@/lib/http/shop-api'
import { retryPayment } from '@/lib/orders/payment'

// Cost guardrails G·1 (scripts/check-duration.mjs): a route stops at its limit, never Vercel's 300 s.
export const maxDuration = 30

// Try paying online again on the same order.
const Body = OrderRef

export async function POST(request: Request) {
  const r = await shopRequest(request, Body, LIMITS.payIp)
  if (!r.ok) return r.response
  const hash = await orderRefHash(r.tenantId, r.body)
  if (!hash) return reply({ error: 'Not found' }, 404)
  const out = await retryPayment(r.tenantId, hash)
  return out.ok ? reply({ pay: out.pay }) : reply({ error: out.error }, out.status)
}
