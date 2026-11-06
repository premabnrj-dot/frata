// =============================================================================
// FILE: src/domains/checkout/delivery.ts
//
// WHAT DELIVERY COSTS AND WHETHER PAY ON DELIVERY IS OFFERED, for an amount in
// paise. One rule for the Settings checkout preview, the product page and
// (1C) the checkout quote — never worked out inline (storefront review
// 2026-11-07). Pincode rules (blocked pincodes, serviceability) are added in
// 1C, where the pincode is known. Pure.
// =============================================================================

export type DeliveryRules = { shippingFlat: number; freeShippingAbove: number; codOn: boolean; codMin: number; codMax: number; codCharge: number }

/** The shipping charge for a bag of `amount` paise: flat, or free from the shop's threshold. */
export function shippingFor(amount: number, r: Pick<DeliveryRules, 'shippingFlat' | 'freeShippingAbove'>): number {
  if (!r.shippingFlat) return 0
  return r.freeShippingAbove && amount >= r.freeShippingAbove ? 0 : r.shippingFlat
}

export type Cod =
  | { offered: false; reason: 'off' }
  | { offered: false; reason: 'below_min'; min: number }
  | { offered: false; reason: 'above_max'; max: number }
  | { offered: true; total: number; charge: number }

/** Pay on delivery for a bag of `amount` paise (before shipping): offered, with the total the shopper pays, or why not. */
export function codFor(amount: number, r: DeliveryRules): Cod {
  if (!r.codOn) return { offered: false, reason: 'off' }
  if (amount < r.codMin) return { offered: false, reason: 'below_min', min: r.codMin }
  const total = amount + shippingFor(amount, r) + r.codCharge
  if (r.codMax && total > r.codMax) return { offered: false, reason: 'above_max', max: r.codMax }
  return { offered: true, total, charge: r.codCharge }
}
