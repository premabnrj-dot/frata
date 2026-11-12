import { z } from 'zod'
import { arrival } from '@/domains/delivery/dates'
import { resolveDelivery } from '@/domains/delivery/resolve'
import { LIMITS } from '@/lib/db/rate-limit'
import { reply, shopRequest } from '@/lib/http/shop-api'
import { deliveryFor } from '@/lib/queries/delivery'

// Cost guardrails G·1 (scripts/check-duration.mjs): a route stops at its limit, never Vercel's 300 s.
export const maxDuration = 30

// Delivery Zones PD·0 (plan docs/plans/2026-11-12-delivery-zones.md): the product page's PIN code check, and the
// Storefront API's delivery resource (ADR-0014). The shop's public terms for one PIN code — whether it delivers, the
// place, the delivery charge and free-above, pay on delivery (its charge and limits) and the arrive-by date for a piece
// in stock — computed now (never cached: a date must move at the cutoff). Named fields only: never a cost of the
// brand's, a rule's kind, a zone's id or a note (ADR-0003; security review L1). The terms are public prices: reading a
// shop's delivery terms PIN code by PIN code is accepted on the record.
const Body = z.object({ pincode: z.string().regex(/^[1-9][0-9]{5}$/) })

export async function POST(request: Request) {
  const r = await shopRequest(request, Body, LIMITS.deliveryIp)
  if (!r.ok) return r.response
  const now = new Date()
  const d = await deliveryFor(r.tenantId, r.body.pincode, now)
  if (!d.shop?.open) return reply({ error: 'This shop is not taking orders right now.' }, 404)
  const t = resolveDelivery(r.body.pincode, d.shop, d.setup)
  const inStock = [{ kind: 'in_stock' as const, shipsBy: null, leadMinDays: null, leadMaxDays: null }]
  const by = t.deliverable ? arrival(inStock, t.days, d.setup && d.dispatch ? d.dispatch : { calendarDays: d.shop.dispatchDays }, now)?.to ?? null : null
  return reply({
    place: d.place ? { city: d.place.city, state: d.place.state } : null,
    deliverable: t.deliverable,
    charge: t.charge, freeAbove: t.freeAbove,
    // Pay on delivery: offered with its charge and limits (the buy box applies them to the piece's price), or why not.
    cod: t.cod.on ? { on: true, charge: t.cod.charge, min: t.cod.min, max: t.cod.max } : { on: false, why: t.cod.why === 'off' ? 'off' : 'prepaid_only' },
    by,
  })
}
