// =============================================================================
// FILE: src/domains/checkout/discounts.ts
//
// OFFERS (docs/specs/2026-11-08-coupons.md, plan docs/plans/2026-11-08-offers.md).
// Called "discounts" in code: "offer" already names the COD offer and a module's offer.
//
// One engine, two callers: quote() for a bag, and reprice() for an order already placed
// (switch to COD, a capture after a switch). Both price each way of paying through
// priceMethod(), so a stored order and a fresh quote can never disagree. Pure; paise; bps.
//
// The order of application (plan review, 2026-11-08):
//   1. order class   — % or ₹ off the bag (with a minimum). The SAME for both ways of paying.
//   2. thresholds    — free shipping (the shop's own and free-shipping offers) and the COD
//                      minimum/maximum, tested on the bag AFTER the order discount.
//   3. payment class — "pay online, save": prepaid only, on the bag after the order discount.
//                      Withheld for both methods when the applied order offer does not combine.
// Each line's GST rate is decided on its own value after its share of the discount, per way of
// paying (CGST s.15(3)(a); decision 1 in the plan): a piece can be 18% on COD and 5% online.
// =============================================================================

import { apportion, taxOrder, type ChargeShare } from '@/domains/tax/gst'

export const DISCOUNT_STYLES = ['order_off', 'free_shipping', 'pay_online'] as const
export type DiscountStyle = (typeof DISCOUNT_STYLES)[number]
export type DiscountClass = 'order' | 'shipping' | 'payment'
/** A style's class: derived, never stored twice. */
export const classOf = (s: DiscountStyle): DiscountClass => (s === 'order_off' ? 'order' : s === 'free_shipping' ? 'shipping' : 'payment')

/** An offer's terms, as the engine reads them (never a limit, a budget or a count: those stay with placement). */
export type DiscountTerms = {
  id: string; title: string; style: DiscountStyle
  percentBps: number | null; amountOff: number | null; cap: number | null; minSubtotal: number
  combinesWithPayment: boolean
  /** Listed offers show at checkout and are applied for the shopper; unlisted ones only by their code. */
  listed: boolean
  /** The shared code, upper-cased; null for an automatic offer. */
  code: string | null; codeId: string | null
}

export type Applied = { discountId: string; codeId: string | null; class: DiscountClass; title: string; amount: number; terms: DiscountTerms }
/** What a listed offer the bag misses needs. */
export type Need = { kind: 'add'; amount: number } | { kind: 'pay_online' } | null
export type Listed = { title: string; code: string | null; style: DiscountStyle; applied: boolean; need: Need }

/** The discount an order-class or payment-class offer gives on `base` paise: 0 below its minimum. */
export function amountFor(t: Pick<DiscountTerms, 'style' | 'percentBps' | 'amountOff' | 'cap' | 'minSubtotal'>, base: number): number {
  if (t.style === 'free_shipping' || base <= 0 || base < t.minSubtotal) return 0
  const raw = t.percentBps != null ? Math.floor((base * t.percentBps) / 10_000) : t.amountOff ?? 0
  return Math.max(0, Math.min(raw, t.cap ?? Number.POSITIVE_INFINITY, base))
}

/** The best of a class by saving; ties go to the automatic offer, then the lower id (stable). */
function best(cands: DiscountTerms[], base: number): { t: DiscountTerms; amount: number } | null {
  const scored = cands.map((t) => ({ t, amount: amountFor(t, base) })).filter((c) => c.amount > 0)
  scored.sort((a, b) => b.amount - a.amount || Number(a.t.code !== null) - Number(b.t.code !== null) || (a.t.id < b.t.id ? -1 : a.t.id > b.t.id ? 1 : 0))
  return scored[0] ?? null
}

export type OfferPlan = {
  order: Applied | null
  /** A free-shipping offer whose minimum the bag meets; it applies only when shipping is charged. */
  freeShipping: DiscountTerms | null
  /** The pay-online saving, for prepaid only; null when none applies or it is withheld. */
  payment: Applied | null
  /** What the typed code did. Every failure reads the same (no "exists but"): spec § Rules. */
  code: 'applied' | 'not_applied' | null
  listed: Listed[]
}

/**
 * Which offers apply to a bag of `subtotal` paise. Candidates: automatic and listed offers, and the offer of the
 * code the shopper typed. One code per order; a code applies only when it is the best of its class.
 */
export function planOffers(subtotal: number, offers: DiscountTerms[], typed: string | null): OfferPlan {
  const code = typed ? typed.trim().toUpperCase() : null
  const cands = offers.filter((t) => t.code === null || t.listed || (code !== null && t.code === code))
  const of = (c: DiscountClass) => cands.filter((t) => classOf(t.style) === c)

  const o = best(of('order'), subtotal)
  const order: Applied | null = o ? { discountId: o.t.id, codeId: o.t.codeId, class: 'order', title: o.t.title, amount: o.amount, terms: o.t } : null
  const afterOrder = subtotal - (order?.amount ?? 0)
  const ship = of('shipping').filter((t) => afterOrder > 0 && afterOrder >= t.minSubtotal)
    .sort((a, b) => Number(a.code !== null) - Number(b.code !== null) || (a.id < b.id ? -1 : 1))[0] ?? null
  const p = order && !order.terms.combinesWithPayment ? null : best(of('payment'), afterOrder)
  const payment: Applied | null = p ? { discountId: p.t.id, codeId: p.t.codeId, class: 'payment', title: p.t.title, amount: p.amount, terms: p.t } : null

  const chosen = new Set([order?.discountId, ship?.id, payment?.discountId].filter(Boolean))
  const usedCode = [order?.terms, ship, payment?.terms].some((t) => t && code !== null && t.code === code)
  const listed: Listed[] = offers.filter((t) => t.listed).map((t) => {
    const applied = chosen.has(t.id)
    const base = classOf(t.style) === 'order' ? subtotal : afterOrder
    const need: Need = applied ? (classOf(t.style) === 'payment' ? { kind: 'pay_online' } : null)
      : base < t.minSubtotal ? { kind: 'add', amount: t.minSubtotal - base } : null
    return { title: t.title, code: t.code, style: t.style, applied, need }
  })
    // A listed offer beaten by a better one of its class is not shown: only what applies or what is within reach.
    .filter((l) => l.applied || l.need)
  return { order, freeShipping: ship, payment, code: code === null ? null : usedCode ? 'applied' : 'not_applied', listed }
}

export type PriceLine = { gross: number; qty: number; hsn: string | null }
export type MethodLine = { discount: number; taxable: number; gstBps: number; gst: number } & ChargeShare
export type MethodPrice = {
  /** Merchandise discount (order + payment), summed over the lines. Shipping waived by an offer is not in it. */
  discount: number
  lines: MethodLine[]
  /** The lines' taxable value: Frrata's fee base and the merchandise net. */
  merchandiseNet: number
  gst: number; total: number
}

/**
 * One way of paying for sold lines: the order discount and (prepaid) the payment discount spread over the lines in
 * proportion to their value, each line taxed at the rate of its own discounted piece, the charges shared over the
 * lines at their rates. `subtotal` is the lines' gross sum.
 */
export function priceMethod(lines: PriceLine[], orderAmount: number, paymentAmount: number, charges: number, o: { registered: boolean; pricesIncludeGst: boolean }): MethodPrice {
  const gross = lines.map((l) => l.gross)
  const subtotal = gross.reduce((a, b) => a + b, 0)
  const orderShare = apportion(orderAmount, gross)
  const payShare = apportion(paymentAmount, gross.map((g, i) => g - orderShare[i]!))
  const disc = lines.map((_, i) => orderShare[i]! + payShare[i]!)
  const net = lines.map((l, i) => l.gross - disc[i]!)
  const t = taxOrder(lines.map((l, i) => ({ gross: net[i]!, unitPrice: net[i]! / l.qty, hsn: l.hsn })), charges, o)
  const out = t.lines.map((l, i) => ({ discount: disc[i]!, taxable: l.taxable, gstBps: l.bps, gst: l.gst, chargeTaxable: l.chargeTaxable, chargeGst: l.chargeGst }))
  const discount = disc.reduce((a, b) => a + b, 0)
  const gst = out.reduce((a, l) => a + l.gst + l.chargeGst, 0)
  return { discount, lines: out, merchandiseNet: out.reduce((a, l) => a + l.taxable, 0), gst, total: subtotal - discount + charges + (o.pricesIncludeGst ? 0 : gst) }
}
