import { z } from 'zod'
import { LIMITS } from '@/lib/db/rate-limit'
import { reply, shopRequest, Token } from '@/lib/http/shop-api'
import { retryPayment } from '@/lib/orders/payment'

// Try paying online again on the same order.
const Body = z.object({ token: Token })

export async function POST(request: Request) {
  const r = await shopRequest(request, Body, LIMITS.payIp)
  if (!r.ok) return r.response
  const out = await retryPayment(r.tenantId, r.body.token)
  return out.ok ? reply({ pay: out.pay }) : reply({ error: out.error }, out.status)
}
