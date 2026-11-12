// =============================================================================
// FILE: src/domains/delivery/resolve.ts — THE delivery rule (Delivery Zones, plan docs/plans/2026-11-12-delivery-zones.md).
// For one PIN code: is it delivered, which zone, what delivery costs, whether and how pay on delivery is offered, and
// how many days it takes. Checkout, the reprice of an order, the product-page check, the policy page and the
// structured data all read this; nothing else decides delivery. Pure.
//
// The FLOOR (every plan; today's Settings) always applies: one delivery charge, free-above, pay on delivery on / min /
// max / fee, and the shop's "no pay on delivery" PIN codes. Without the app (or while it is off, paused or lapsed) the
// floor is the whole answer, exactly as before. With the app usable, the PIN code's zone replaces the floor's numbers
// and a PIN code rule tightens them; the floor's no-COD list still applies.
// =============================================================================

import { inPreset, type PresetKey } from './presets'
import { floorTerms, type CodTerms, type DeliveryTerms, type Floor } from './floor'
export { chargeOn, codOn, floorTerms, type Cod, type CodTerms, type DeliveryTerms, type Floor } from './floor'

export type Zone = {
  id: string; name: string; position: number
  /** A starting zone matched by prefix (presets.ts), or null for the brand's own (matched by its PIN codes). */
  preset: PresetKey | null
  charge: number; freeAbove: number | null; daysMin: number; daysMax: number
  codOn: boolean; codCharge: number; codMin: number; codMax: number | null
}

export type PinRule = { rule: 'no_delivery' } | { rule: 'prepaid_only' } | { rule: 'cod_max'; codMax: number }

/** The app's part, read for ONE PIN code: zones (≤ 50, no PIN lists), the brand's zone that lists this PIN code or its
 *  prefix (if any), and this PIN code's rule (if any). Null when the app is not usable. */
export type ZoneSetup = { zones: readonly Zone[]; ownZoneIds: readonly string[]; rule: PinRule | null }

const PIN = /^[1-9][0-9]{5}$/

/** The zone for a PIN code: the brand's own zones that list it, then the starting zones in their order; `rest` last. */
export function zoneFor(pin: string, setup: ZoneSetup): Zone | null {
  const byPos = [...setup.zones].sort((a, b) => a.position - b.position)
  const own = byPos.find((z) => z.preset === null && setup.ownZoneIds.includes(z.id))
  if (own) return own
  return byPos.find((z) => z.preset !== null && z.preset !== 'rest' && inPreset(z.preset, pin))
    ?? byPos.find((z) => z.preset === 'rest') ?? null
}

/** THE rule: delivery to `pin` (or, with no PIN code yet, the shop's default terms — the product page's buy box). */
export function resolveDelivery(pin: string | null, floor: Floor, setup: ZoneSetup | null): DeliveryTerms {
  const blocked = !!pin && !!floor.codBlockedPincodes?.includes(pin)
  const onFloor = floorTerms(pin, floor)
  if (!setup || !pin || !PIN.test(pin)) return onFloor
  const z = zoneFor(pin, setup)
  if (!z) return onFloor
  let cod: CodTerms = !z.codOn ? { on: false, why: 'off' } : blocked ? { on: false, why: 'blocked_pincode' }
    : { on: true, charge: z.codCharge, min: z.codMin, max: z.codMax }
  const r = setup.rule
  if (r?.rule === 'no_delivery') return { deliverable: false, zone: z.name, charge: z.charge, freeAbove: z.freeAbove, cod: { on: false, why: 'off' }, days: [z.daysMin, z.daysMax] }
  if (r?.rule === 'prepaid_only' && cod.on) cod = { on: false, why: 'prepaid_only' }
  if (r?.rule === 'cod_max' && cod.on) cod = { ...cod, max: cod.max === null ? r.codMax : Math.min(cod.max, r.codMax) }
  return { deliverable: true, zone: z.name, charge: z.charge, freeAbove: z.freeAbove, cod, days: [z.daysMin, z.daysMax] }
}

