// =============================================================================
// FILE: src/domains/checkout/delivery.ts
//
// WHAT DELIVERY COSTS AND WHETHER PAY ON DELIVERY IS OFFERED, for an amount in
// paise. One rule for the Settings checkout preview, the product page and
// (1C) the checkout quote — never worked out inline (storefront review
// 2026-11-07). The merchant's own blocked pincodes apply once a pincode is
// known (checkout); courier serviceability is deferred (owner). Pure.
// =============================================================================

import { codOn, floorTerms, type Cod } from '@/domains/delivery/floor'

export type DeliveryRules = { shippingFlat: number; freeShippingAbove: number; codOn: boolean; codMin: number; codMax: number; codCharge: number; codBlockedPincodes?: readonly string[] }

/** The shipping charge for a bag of `amount` paise: flat, or free from the shop's threshold. */
export function shippingFor(amount: number, r: Pick<DeliveryRules, 'shippingFlat' | 'freeShippingAbove'>): number {
  if (!r.shippingFlat) return 0
  return r.freeShippingAbove && amount >= r.freeShippingAbove ? 0 : r.shippingFlat
}

export type { Cod } from '@/domains/delivery/floor'


/** Pay on delivery on the FLOOR (today's Settings) for a bag of `amount` paise — the buy box and Settings' preview.
 *  Checkout reads `codOn(amount, resolveDelivery(pin, floor, zones))` (src/domains/delivery/resolve.ts), the one rule;
 *  this is its floor (floor.ts), so the browser never ships the zone presets. */
export function codFor(amount: number, r: DeliveryRules, pincode?: string | null): Cod {
  return codOn(amount, floorTerms(pincode ?? null, { ...r, dispatchDays: 0, metroDays: 0, restDays: 0 }), pincode)
}
