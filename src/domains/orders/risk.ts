// =============================================================================
// FILE: src/domains/orders/risk.ts
//
// WHICH PAY-ON-DELIVERY ORDERS TO CALL FIRST (docs/specs/2026-11-07-orders.md
// § Risk rules). Reasons in plain words and one next step — never a score,
// never stored, never acting on its own: it advises; a person confirms or
// cancels (an RTO alone does not prove fraud — Razorpay, 2026-10-08). Pure.
// The facts come from one query (src/lib/queries/orders.ts), counted against
// the order's own placed_at, so an order's risk does not change the next day.
// =============================================================================

export type RiskFacts = {
  /** Only a COD order not paid online carries the risk of a refused delivery. */
  cod: boolean
  total: number
  customerName: string
  /** The house/street line as typed (without the area joined on). */
  addressLine: string
  city: string
  /** The pincode's city from the directory; null when the pincode is not in it (the rule is then off). */
  pincodeCity: string | null
  /** Other open orders from this phone with the same items, placed within 24 h before this one. */
  sameItemsWithin24h: number
  /** COD orders from this phone on this order's IST day, this one included. */
  codFromPhoneToday: number
  /** Earlier orders from this phone the shop cancelled as "Fake order". */
  cancelledAsFake: number
  /** Earlier orders from this phone, any state. */
  earlierOrders: number
  /** This shop's median COD order over the last 90 days; null below MIN_FOR_MEDIAN orders. */
  medianCod: number | null
}

export type Risk = { level: 'low' | 'medium' | 'high'; reasons: string[]; next: string | null }

export const MIN_FOR_MEDIAN = 10
const TEST_NAME = /^(test|testing|abc|xyz|asdf|qwerty|na|n\/a|.)$/i

const normal = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')

export function risk(f: RiskFacts): Risk {
  if (!f.cod) return { level: 'low', reasons: [], next: null }
  const high: string[] = []
  if (f.sameItemsWithin24h > 0) high.push('Possible duplicate: the same items from this phone in the last 24 hours')
  if (f.codFromPhoneToday >= 3) high.push(`${f.codFromPhoneToday} pay-on-delivery orders from this phone today`)
  if (f.cancelledAsFake > 0) high.push('An earlier order from this phone was cancelled as fake')
  if (high.length) return { level: 'high', reasons: high.slice(0, 3), next: 'Call before confirming. Cancel if unreachable.' }

  const medium: string[] = []
  if (f.earlierOrders === 0) medium.push('First order from this phone')
  const line = f.addressLine.trim()
  if (!/\d/.test(line) || line.length < 15) medium.push('The address has no house or building number, or is very short')
  if (f.pincodeCity && f.city && normal(f.pincodeCity) !== normal(f.city)) medium.push(`The city typed is not the pincode's city (${f.pincodeCity})`)
  if (f.medianCod !== null && f.total > 2 * f.medianCod) medium.push('Over twice your usual pay-on-delivery order')
  if (TEST_NAME.test(f.customerName.trim())) medium.push('The name looks like a test')
  if (medium.length >= 2) return { level: 'medium', reasons: medium.slice(0, 3), next: 'Call or WhatsApp to confirm.' }
  return { level: 'low', reasons: [], next: null }
}
