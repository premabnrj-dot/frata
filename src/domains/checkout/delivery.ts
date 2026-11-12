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

/** Why Pay on delivery is not offered, in the shopper's words. */
export function codWhyNot(c: Cod, inr: (paise: number) => string): string | null {
  if (c.offered) return null
  if (c.reason === 'off') return 'This shop does not take Pay on delivery.'
  if (c.reason === 'below_min') return `Pay on delivery is for orders from ${inr(c.min)}.`
  if (c.reason === 'above_max') return `Pay on delivery is for orders up to ${inr(c.max)}. Pay online for this bag.`
  if (c.reason === 'not_delivered') return 'This shop does not deliver to this PIN code yet.'
  if (c.reason === 'prepaid_only') return `Pay online for ${c.pincode}.`
  return `Pay on delivery is not offered to ${c.pincode}.`
}
