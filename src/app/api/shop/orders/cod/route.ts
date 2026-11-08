import { z } from 'zod'
import { LIMITS } from '@/lib/db/rate-limit'
import { publicQuote, reply, shopRequest, Token } from '@/lib/http/shop-api'
import { switchToCod } from '@/lib/orders/payment'

// Pay on delivery instead, on the same unpaid online order (asks Razorpay first: no double charge).
const Body = z.object({ token: Token, expectedTotal: z.number().int().min(0) })

export async function POST(request: Request) {
  const r = await shopRequest(request, Body, LIMITS.payIp)
  if (!r.ok) return r.response
  const out = await switchToCod(r.tenantId, r.body.token, r.body.expectedTotal)
  if (out.kind === 'changed') return reply({ changed: true, quote: publicQuote(out.quote) }, 409)
  if (out.kind === 'refused') return reply({ error: out.error, ...(out.codTotal !== undefined ? { codTotal: out.codTotal } : {}) }, out.status)
  return reply(out)
}
