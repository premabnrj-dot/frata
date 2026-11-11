import { z } from 'zod'
import { STATES } from '@/domains/checkout/address'
import { LIMITS } from '@/lib/db/rate-limit'
import { placeForPincode } from '@/lib/db/platform'
import { reply, shopRequest } from '@/lib/http/shop-api'

// Cost guardrails G·1 (scripts/check-duration.mjs): a route stops at its limit, never Vercel's 300 s.
export const maxDuration = 30

// City and state for a typed pincode, from India Post's directory — to fill the address, nothing more.
// (Whether a courier delivers there is the pincode check the owner deferred.)
const Body = z.object({ pincode: z.string().regex(/^[1-9][0-9]{5}$/) })

export async function POST(request: Request) {
  const r = await shopRequest(request, Body, LIMITS.quoteIp)
  if (!r.ok) return r.response
  const place = await placeForPincode(r.body.pincode).catch(() => null)
  if (!place) return reply({ city: null, state: null })
  const norm = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z]/g, '')
  const state = STATES.find((x) => norm(x) === norm(place.state)) ?? null
  const city = place.city.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
  return reply({ city, state })
}
