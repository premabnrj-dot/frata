// =============================================================================
// FILE: src/domains/studio/prices.ts — WHAT A PARTNER PAYS FOR STUDIO CREDITS (C1·1; spec docs/specs/2026-11-16-studio-agent.md
// § 8, owner decisions 7 and 20; plan docs/plans/2026-11-22-c1-credits.md, owner 2026-11-22).
//
// Pure. Money is integer paise. One table of prices, read by the page, the purchase, the invoice and the tests: a price
// is never written twice. GST is billing's own: each head on the taxable value (frrataGstHeads), CGST + SGST or IGST.
// =============================================================================

import { frrataGstHeads } from '@/domains/billing/bill'
import { paise, type Paise } from '@/domains/money/paise'

/** The two paid plans (owner decision 7). A plan's AutoPay maximum sits just above its price with GST (owner call 5,
 *  22 Nov): Studio ₹3,538.82 under ₹3,600; Plus ₹11,798.82 under ₹12,000; both under RBI's ₹15,000 without extra checks. */
export const SEAT_PLANS = {
  studio: { name: 'Studio', price: paise(2_99_900), credits: 150, mandateMax: paise(3_60_000) },
  plus: { name: 'Studio Plus', price: paise(9_99_900), credits: 500, mandateMax: paise(12_00_000) },
} as const
export type SeatPlan = keyof typeof SEAT_PLANS
export const SEAT_PLAN_KEYS = Object.keys(SEAT_PLANS) as SeatPlan[]

/** A pack: 100 credits for ₹1,999 (owner decision 7; kept at 2.99× after card fees, owner 2026-11-22). */
export const PACK = { credits: 100, price: paise(1_99_900) } as const
/** A typed credit ("Any amount"): ₹20. */
export const CREDIT_PRICE = paise(2_000)
/** Any amount: 20 to 4,000 credits a purchase (owner 2026-11-22: under ₹1 lakh with GST, so UPI takes it in one go). */
export const TYPED_MIN = 20
export const TYPED_MAX = 4_000
export const typedCreditsValid = (n: number) => Number.isInteger(n) && n >= TYPED_MIN && n <= TYPED_MAX

/** The free credits a partner gets once at approval (decision 20), used within 90 days (owner 2026-11-22). */
export const FREE_CREDITS = 20
export const FREE_DAYS = 90
/** Every bought credit — seat, pack or typed — is usable for 12 months (owner 2026-11-22, replacing decision c). */
export const LOT_MONTHS = 12

export type Buy = { kind: 'pack' } | { kind: 'credits'; credits: number } | { kind: 'seat'; plan: SeatPlan }

/** Credits and the price before GST for a purchase; null for an amount out of range. */
export function priced(b: Buy): { credits: number; taxable: Paise } | null {
  if (b.kind === 'pack') return { credits: PACK.credits, taxable: PACK.price }
  if (b.kind === 'seat') return { credits: SEAT_PLANS[b.plan].credits, taxable: SEAT_PLANS[b.plan].price }
  if (!typedCreditsValid(b.credits)) return null
  return { credits: b.credits, taxable: paise(b.credits * CREDIT_PRICE) }
}

export type Quote = { credits: number; taxable: Paise; cgst: Paise; sgst: Paise; igst: Paise; total: Paise }

/**
 * A purchase with its GST: CGST + SGST when the buyer's state is Frrata's own, IGST otherwise (place of supply: the
 * buyer's registered state, or the state on its address without a GSTIN; owner 2026-11-22 g). Null when out of range.
 */
export function quote(b: Buy, sellerGstin: string | null, buyerStateCode: string | null): Quote | null {
  const p = priced(b)
  if (!p) return null
  const h = frrataGstHeads(p.taxable, sellerGstin, buyerStateCode)
  return { credits: p.credits, taxable: p.taxable, ...h, total: paise(p.taxable + h.cgst + h.sgst + h.igst) }
}

/** The price with GST a person reads before choosing (the dialog's "Pay ₹2,358.82"): billing's own heads, out of state. */
export const withGst = (taxable: Paise): Paise => {
  const h = frrataGstHeads(taxable, null, null)
  return paise(taxable + h.cgst + h.sgst + h.igst)
}
