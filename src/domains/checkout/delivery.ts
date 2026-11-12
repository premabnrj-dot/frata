// =============================================================================
// FILE: src/domains/checkout/delivery.ts
//
// WHAT DELIVERY COSTS AND WHETHER PAY ON DELIVERY IS OFFERED, for an amount in
// paise. One rule for the Settings checkout preview, the product page and
// (1C) the checkout quote — never worked out inline (storefront review
// 2026-11-07). The merchant's own blocked pincodes apply once a pincode is
// known (checkout); courier serviceability is deferred (owner). Pure.
// =============================================================================

export type DeliveryRules = { shippingFlat: number; freeShippingAbove: number; codOn: boolean; codMin: number; codMax: number; codCharge: number; codBlockedPincodes?: readonly string[] }

/** The shipping charge for a bag of `amount` paise: flat, or free from the shop's threshold. */
export function shippingFor(amount: number, r: Pick<DeliveryRules, 'shippingFlat' | 'freeShippingAbove'>): number {
  if (!r.shippingFlat) return 0
  return r.freeShippingAbove && amount >= r.freeShippingAbove ? 0 : r.shippingFlat
}

export type Cod =
  | { offered: false; reason: 'off' }
  | { offered: false; reason: 'below_min'; min: number }
  | { offered: false; reason: 'above_max'; max: number }
  | { offered: false; reason: 'blocked_pincode'; pincode: string }
  | { offered: true; total: number; charge: number }

/** The shop turned Pay on delivery off for this pincode (checkout, and an address edit on a COD order alike). */
export const codBlockedFor = (pincode: string | null | undefined, blocked: readonly string[] | null | undefined): boolean => !!pincode && !!blocked?.includes(pincode)

/** Pay on delivery for a bag of `amount` paise (before shipping): offered, with the total the shopper pays, or why not. */
export function codFor(amount: number, r: DeliveryRules, pincode?: string | null): Cod {
  if (!r.codOn) return { offered: false, reason: 'off' }
  if (pincode && codBlockedFor(pincode, r.codBlockedPincodes)) return { offered: false, reason: 'blocked_pincode', pincode }
  if (amount < r.codMin) return { offered: false, reason: 'below_min', min: r.codMin }
  const total = amount + shippingFor(amount, r) + r.codCharge
  if (r.codMax && total > r.codMax) return { offered: false, reason: 'above_max', max: r.codMax }
  return { offered: true, total, charge: r.codCharge }
}

/** Why Pay on delivery is not offered, in the shopper's words. */
export function codWhyNot(c: Cod, inr: (paise: number) => string): string | null {
  if (c.offered) return null
  if (c.reason === 'off') return 'This shop does not take Pay on delivery.'
  if (c.reason === 'below_min') return `Pay on delivery is for orders from ${inr(c.min)}.`
  if (c.reason === 'above_max') return `Pay on delivery is for orders up to ${inr(c.max)}. Pay online for this bag.`
  return `Pay on delivery is not offered to ${c.pincode}.`
}
