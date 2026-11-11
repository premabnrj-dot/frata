import { z } from 'zod'
import { reply, shopRequest } from '@/lib/http/shop-api'
import { LIMITS } from '@/lib/db/rate-limit'
import { sessionToken } from '@/lib/ekcode/handshake'
import { saveToEkcode } from '@/lib/queries/customers'

// Cost guardrails G·1 (scripts/check-duration.mjs): a route stops at its limit, never Vercel's 300 s.
export const maxDuration = 30

// "Save this address to EkCode" (ticked by default for EkCode shoppers with a new address; owner, 2026-11-09): posted by
// the checkout after the order is placed, with the session's one-time save token. Never part of placing the order.
export const dynamic = 'force-dynamic'
const Body = z.object({
  label: z.string().trim().min(1).max(20),
  address: z.object({ addressLine: z.string().max(200), area: z.string().max(120), landmark: z.string().max(120), city: z.string().max(60), state: z.string().max(60), pincode: z.string().regex(/^[1-9][0-9]{5}$/) }),
})

export async function POST(request: Request) {
  const g = await shopRequest(request, Body, LIMITS.ekShopMeIp, true)
  if (!g.ok) return g.response
  const token = await sessionToken()
  const ok = token ? await saveToEkcode(g.tenantId, token, g.body.label, g.body.address) : false
  return reply({ saved: ok })
}
