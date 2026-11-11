import { z } from 'zod'
import { OrderRef, orderRefHash } from '@/lib/http/order-ref'
import { LIMITS } from '@/lib/db/rate-limit'
import { publicQuote, reply, shopRequest } from '@/lib/http/shop-api'
import { switchToCod } from '@/lib/orders/payment'
import { drainSoon } from '@/lib/outbox/drain'

// Cost guardrails G·1 (scripts/check-duration.mjs): a route stops at its limit, never Vercel's 300 s.
export const maxDuration = 30

// Pay on delivery instead, on the same unpaid online order (asks Razorpay first: no double charge).
const Body = z.intersection(OrderRef, z.object({ expectedTotal: z.number().int().min(0) }))

export async function POST(request: Request) {
  const r = await shopRequest(request, Body, LIMITS.payIp)
  if (!r.ok) return r.response
  const hash = await orderRefHash(r.tenantId, r.body)
  if (!hash) return reply({ error: 'Not found' }, 404)
  const out = await switchToCod(r.tenantId, hash, r.body.expectedTotal)
  if (out.kind === 'changed') return reply({ changed: true, quote: publicQuote(out.quote) }, 409)
  if (out.kind === 'refused') return reply({ error: out.error, ...(out.codTotal !== undefined ? { codTotal: out.codTotal } : {}) }, out.status)
  drainSoon() // "Order confirmed" for the switch to COD (email E·2)
  return reply(out)
}
