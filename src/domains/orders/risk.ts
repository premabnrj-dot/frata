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
  /** The pincode's district from the directory: a town typed inside it is never a mismatch. */
  pincodeDistrict?: string | null
  /** Other open orders from this phone with the same items, placed within 24 h before this one. */
  sameItemsWithin24h: number
  /** COD orders from this phone on this order's IST day, this one included. */
  codFromPhoneToday: number
  /** Earlier orders from this phone the shop cancelled as "Fake order". */
  cancelledAsFake: number
  /** Earlier parcels to this phone that came back (RTO) at this shop: the refusal that costs two-way freight. */
  cameBack: number
  /** Earlier orders from this phone, any state. */
  earlierOrders: number
  /** This shop's median COD order over the last 90 days; null below MIN_FOR_MEDIAN orders. */
  medianCod: number | null
}

export type Risk = { level: 'low' | 'medium' | 'high'; reasons: string[]; next: string | null }

export const MIN_FOR_MEDIAN = 10
const TEST_NAME = /^(test|testing|abc|xyz|asdf|qwerty|na|n\/a|.)$/i

const normal = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')
/** A city with no Latin letter can't be compared with the directory's English one (shop stress test 2026-11-11: a
 * genuine Hindi address read "the city typed is not the pincode's city"); one with any Latin letter still is. */
const comparable = (s: string) => /\p{Script=Latin}/u.test(s)
/** Old and new names of the same city, and a district's common city name (all `normal`ised). */
const SAME_AS: Record<string, string> = {
  bangalore: 'bengaluru', bengaluruurban: 'bengaluru', bengalururural: 'bengaluru', bombay: 'mumbai', mumbaisuburban: 'mumbai',
  calcutta: 'kolkata', madras: 'chennai', gurgaon: 'gurugram', ahmadabad: 'ahmedabad', pondicherry: 'puducherry', poona: 'pune',
  baroda: 'vadodara', trivandrum: 'thiruvananthapuram', cochin: 'kochi', ernakulam: 'kochi', mysore: 'mysuru',
  mangalore: 'mangaluru', belgaum: 'belagavi', gulbarga: 'kalaburagi', allahabad: 'prayagraj', benares: 'varanasi',
  banaras: 'varanasi', vizag: 'visakhapatnam', visakhapatanam: 'visakhapatnam', noida: 'gautambuddhanagar',
  greaternoida: 'gautambuddhanagar', mohali: 'sasnagar', secunderabad: 'hyderabad', thoothukudi: 'tuticorin',
}
const canon = (s: string) => { const n = normal(s); return SAME_AS[n] ?? n }
/** Edits needed to turn a into b (spellings: "ahmadabad"/"ahmedabad", "gurugaon"). */
function edits(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[b.length] ?? 0
}
/** Whether the city typed can be the directory's place: same name or an old one, one inside the other ("Delhi" in
 * "New Delhi"), or a spelling two letters off. Shop stress test 2026-11-12: an exact match flagged "Bangalore". */
export function sameCity(typed: string, place: string): boolean {
  const a = canon(typed), b = canon(place)
  if (!a || !b || a === b) return true
  if (Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a))) return true
  return Math.min(a.length, b.length) >= 6 && edits(a, b) <= 2
}

/** A house or building number in any script's digits (Devanagari ०–९, Bengali, Gurmukhi, Gujarati, Tamil…). */
const HAS_NUMBER = /\p{Nd}/u

export function risk(f: RiskFacts): Risk {
  if (!f.cod) return { level: 'low', reasons: [], next: null }
  const high: string[] = []
  if (f.sameItemsWithin24h > 0) high.push('Possible duplicate: the same items from this phone in the last 24 hours')
  if (f.codFromPhoneToday >= 3) high.push(`${f.codFromPhoneToday} pay-on-delivery orders from this phone today`)
  if (f.cancelledAsFake > 0) high.push('An earlier order from this phone was cancelled as fake')
  // Shop stress test 2026-11-11: a phone that refused before read Low (its refusals even counted as "not a first
  // order") and went through bulk confirm. Still advice, never a block: an RTO alone does not prove fraud.
  if (f.cameBack > 0) high.push(f.cameBack === 1 ? 'An earlier parcel to this phone came back' : `${f.cameBack} earlier parcels to this phone came back`)
  if (high.length) return { level: 'high', reasons: high.slice(0, 3), next: 'Call before confirming. Cancel if unreachable.' }

  const medium: string[] = []
  if (f.earlierOrders === 0) medium.push('First order from this phone')
  const line = f.addressLine.trim()
  if (!HAS_NUMBER.test(line) || line.length < 15) medium.push('The address has no house or building number, or is very short')
  if (f.pincodeCity && f.city && comparable(f.city) && !sameCity(f.city, f.pincodeCity) && !(f.pincodeDistrict && sameCity(f.city, f.pincodeDistrict))) medium.push(`The city typed is not the pincode's city (${f.pincodeCity})`)
  if (f.medianCod !== null && f.total > 2 * f.medianCod) medium.push('Over twice your usual pay-on-delivery order')
  if (TEST_NAME.test(f.customerName.trim())) medium.push('The name looks like a test')
  if (medium.length >= 2) return { level: 'medium', reasons: medium.slice(0, 3), next: 'Call or WhatsApp to confirm.' }
  return { level: 'low', reasons: [], next: null }
}
