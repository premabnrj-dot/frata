// =============================================================================
// FILE: src/domains/delivery/floor.ts — the FLOOR of the delivery rule: today's Settings as terms, and pay on delivery
// on any terms (Delivery Zones, plan docs/plans/2026-11-12-delivery-zones.md). Kept apart from resolve.ts so the browser
// code that reads the floor (the buy box, Settings' preview) never ships the zone presets (speed review H3). Pure.
// =============================================================================

/** Today's Settings (shop_settings), in paise and days. */
export type Floor = {
  shippingFlat: number; freeShippingAbove: number
  codOn: boolean; codMin: number; codMax: number; codCharge: number; codBlockedPincodes?: readonly string[]
  dispatchDays: number; metroDays: number; restDays: number
}

export type CodTerms = { on: true; charge: number; min: number; max: number | null } | { on: false; why: 'off' | 'prepaid_only' | 'blocked_pincode' }

/** What delivery to one PIN code is, before any bag: the shopper's terms. Never a cost of the brand's. */
export type DeliveryTerms = {
  deliverable: boolean
  /** The zone's name, or null on the floor. */
  zone: string | null
  charge: number
  freeAbove: number | null
  cod: CodTerms
  /** Delivery days after dispatch. */
  days: readonly [number, number]
}

/** The floor's terms for a PIN code (or none yet): one charge, free-above, pay on delivery, the no-COD list. */
export function floorTerms(pin: string | null, floor: Floor): DeliveryTerms {
  const blocked = !!pin && !!floor.codBlockedPincodes?.includes(pin)
  const cod: CodTerms = !floor.codOn ? { on: false, why: 'off' } : blocked ? { on: false, why: 'blocked_pincode' }
    : { on: true, charge: floor.codCharge, min: floor.codMin, max: floor.codMax || null }
  return { deliverable: true, zone: null, charge: floor.shippingFlat, freeAbove: floor.freeShippingAbove || null, cod, days: [floor.metroDays, floor.restDays] }
}

/** The delivery charge for a bag of `amount` paise on these terms: the charge, or free from the threshold. */
export function chargeOn(amount: number, t: Pick<DeliveryTerms, 'charge' | 'freeAbove'>): number {
  if (!t.charge) return 0
  return t.freeAbove && amount >= t.freeAbove ? 0 : t.charge
}

/** Pay on delivery for a bag of `amount` paise (after order offers, before delivery) on these terms — the existing
 *  `Cod` answer checkout reads: the floor's order of checks (off, the PIN code, the minimum, then the maximum counted
 *  with delivery and the fee). */
export function codOn(amount: number, t: DeliveryTerms, pincode?: string | null): Cod {
  if (!t.deliverable) return { offered: false, reason: 'not_delivered' }
  if (!t.cod.on) {
    if (t.cod.why === 'off') return { offered: false, reason: 'off' }
    return { offered: false, reason: t.cod.why === 'prepaid_only' ? 'prepaid_only' : 'blocked_pincode', pincode: pincode ?? '' }
  }
  if (amount < t.cod.min) return { offered: false, reason: 'below_min', min: t.cod.min }
  const total = amount + chargeOn(amount, t) + t.cod.charge
  if (t.cod.max && total > t.cod.max) return { offered: false, reason: 'above_max', max: t.cod.max }
  return { offered: true, total, charge: t.cod.charge }
}

export type Cod =
  | { offered: false; reason: 'off' }
  | { offered: false; reason: 'not_delivered' }
  | { offered: false; reason: 'below_min'; min: number }
  | { offered: false; reason: 'above_max'; max: number }
  | { offered: false; reason: 'blocked_pincode' | 'prepaid_only'; pincode: string }
  | { offered: true; total: number; charge: number }
