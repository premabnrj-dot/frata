// =============================================================================
// FILE: src/domains/checkout/replan.ts
//
// AN ORDER'S OWN OFFERS ON NEW LINES (an order edit, docs/plans/2026-11-12-order-edit.md). The terms are the ones the
// order kept at placement (order_discounts: kept-terms.ts), never today's offers; the steps are planOffers' own
// (discounts.ts productPass and amountFor), so a re-plan of unchanged lines gives back exactly what placement kept.
// Pure; paise; bps.
// =============================================================================

import { amountFor, classOf, productPass, type DiscountTerms, type PlanLine, type ProductTerms } from './discounts'

/** An offer's terms as an order keeps them (order_discounts, copied at placement: kept-terms.ts). */
export type KeptTerms = ProductTerms & Pick<DiscountTerms, 'title' | 'tiers'>
/** An offer an order kept: its terms, the way of paying it is for (null: as its class says), and what it gave. */
export type Kept = { terms: KeptTerms; method: 'cod' | 'prepaid' | null; amount: number }
export type Replanned = {
  /** Each line's product-offer discount (in `lines` order). */
  productDisc: number[]
  /** The kept offers that still apply, each with what it gives now. */
  kept: Kept[]
  /** The kept offers that no longer apply, as they were. */
  removed: Kept[]
  /** The delivery charge: the order's, plus what a free-delivery offer that came off had waived. */
  shipping: number
}

/**
 * An order's OWN offers re-planned on new lines (an order edit), from the terms it kept — never today's offers, and never
 * an offer it did not get (a better one, a code, a first-order offer: those were decided at placement). The same steps as
 * planOffers: product offers greedy over the lines; each order offer on the bag after them (its tier step reached, or
 * off below its minimum); free delivery on the bag after the order offer paying on delivery gets (an order kept for one
 * way only: `method`), and when it no longer applies the charge it waived comes back; the pay-online saving on the bag
 * after the online order offer. One that gives nothing comes off. Limits and budgets are the caller's (placement's rule).
 * `charge`, when given, is the delivery charge before offers for the bag after the order offer (an order edit: the
 * shop's own free-delivery threshold crossed, orders/edit.ts): free delivery that still applies waives that charge, and
 * comes off when there is none to waive.
 */
export function replanKept(lines: PlanLine[], kept: Kept[], shipping: number, charge?: (afterOrder: number) => number): Replanned {
  const subtotal = lines.reduce((a, l) => a + l.unitPrice * l.qty, 0)
  const cls = (k: Kept) => classOf(k.terms.style)
  const { productDisc, taken } = productPass(lines, kept.filter((k) => cls(k) === 'product').map((k) => k.terms), subtotal)
  const afterProduct = subtotal - productDisc.reduce((a, b) => a + b, 0)
  const now = new Map<Kept, number>(kept.filter((k) => cls(k) === 'product').map((k) => [k, taken.find((x) => x.t === k.terms)?.total ?? 0]))
  for (const k of kept.filter((x) => cls(x) === 'order')) now.set(k, amountFor(k.terms, afterProduct))
  const orderFor = (way: 'cod' | 'prepaid') => { const k = kept.find((x) => cls(x) === 'order' && (x.method === null || x.method === way)); return k ? now.get(k)! : 0 }
  const afterOrder = afterProduct - orderFor('cod')
  // Free delivery keeps what it waived while the bag still reaches its minimum; the charge is the order's, not today's
  // (or `charge`'s, when given).
  const base = charge?.(afterOrder)
  for (const k of kept.filter((x) => cls(x) === 'shipping')) now.set(k, afterOrder > 0 && afterOrder >= k.terms.minSubtotal ? base ?? k.amount : 0)
  for (const k of kept.filter((x) => cls(x) === 'payment')) now.set(k, amountFor(k.terms, afterProduct - orderFor('prepaid')))
  const on = kept.filter((k) => now.get(k)! > 0)
  const removed = kept.filter((k) => now.get(k)! <= 0)
  const waived = on.filter((k) => cls(k) === 'shipping').reduce((a, k) => a + now.get(k)!, 0)
  return {
    productDisc, kept: on.map((k) => ({ ...k, amount: now.get(k)! })), removed,
    shipping: base !== undefined ? Math.max(0, base - waived) :shipping + removed.filter((k) => cls(k) === 'shipping').reduce((a, k) => a + k.amount, 0),
  }
}
