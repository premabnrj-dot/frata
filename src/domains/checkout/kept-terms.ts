// =============================================================================
// FILE: src/domains/checkout/kept-terms.ts
//
// AN OFFER'S TERMS AS AN ORDER KEEPS THEM (order_discounts' typed columns, drizzle/0110). Copied at placement, so the
// order keeps the terms it was sold on whatever the offer becomes (a started offer's terms can still be changed by an
// owner): its value, its tiers, Buy X get Y, its gift and the products it covered (a collection as its products then).
// `storedTerms` reads them back for replanKept (replan.ts). Pure.
// =============================================================================

import { classOf, stepReached, type DiscountStyle, type DiscountTerms } from './discounts'
import type { KeptTerms } from './replan'

/** The columns an order offer's terms are kept in. Null where the style has none. */
export type StoredTerms = {
  /** The value given at placement: a tiered offer's step reached (min_subtotal is that step's minimum). */
  percentBps: number | null; amountOff: number | null; cap: number | null; minSubtotal: number
  /** A tiered order offer's every step: its minimum, and each step's % or each step's ₹ (the offer's kind: one list). */
  tierMins: number[] | null; tierPercentBps: number[] | null; tierAmountsOff: number[] | null
  /** A product offer: 'all' products, or 'products' and their ids. Null on any other class — and on a product offer
   *  placed before terms were copied (0110), whose terms are not known. */
  targets: 'all' | 'products' | null; targetProducts: string[] | null
  buyQty: number | null; getQty: number | null; getBps: number | null
  giftVariantId: string | null
}

/** The terms an order keeps of an offer it got, at placement; `base` is the bag after product offers (a tier's step). */
export function termsCopy(t: DiscountTerms, base: number): StoredTerms {
  const step = stepReached(t.tiers, base)
  const value = step ? { percentBps: step.percentBps, amountOff: step.amountOff, cap: t.cap, minSubtotal: step.min } : { percentBps: t.percentBps, amountOff: t.amountOff, cap: t.cap, minSubtotal: t.minSubtotal }
  // A shop's steps are all of the offer's kind (offer-form.ts); steps of both kinds are not kept (the step reached is).
  const steps = classOf(t.style) === 'order' && t.tiers?.length ? t.tiers : null
  const pct = steps?.every((x) => x.percentBps != null) ? steps.map((x) => x.percentBps!) : null
  const off = steps?.every((x) => x.percentBps == null && x.amountOff != null) ? steps.map((x) => x.amountOff!) : null
  const tiers = pct || off ? steps : null
  const product = classOf(t.style) === 'product'
  const some = product && Array.isArray(t.targets) ? (t.targets as readonly string[]) : null
  const bxgy = t.style === 'bxgy' && t.buyQty != null && t.getQty != null
  return {
    ...value,
    tierMins: tiers ? tiers.map((x) => x.min) : null, tierPercentBps: pct, tierAmountsOff: off,
    targets: product ? (some ? 'products' : 'all') : null, targetProducts: some ? [...some] : null,
    // The engine's own default for the % off the Y pieces (productOffer): free.
    buyQty: bxgy ? t.buyQty! : null, getQty: bxgy ? t.getQty! : null, getBps: bxgy ? t.getBps ?? 10_000 : null,
    giftVariantId: t.style === 'free_gift' ? t.giftVariantId ?? null : null,
  }
}

/**
 * The terms back from an order_discounts row, for replanKept. Null for a product offer placed before its terms were
 * copied (0110): what it covered is not known, so it cannot be re-planned. An order offer placed then re-plans on the
 * step it reached (its tiers were not kept). `code` is the row's code_id: the re-plan reads only whether the offer came
 * with a code (on a tie an automatic offer goes first, as at placement), never its text.
 */
export function storedTerms(r: StoredTerms & { discountId: string; title: string; style: DiscountStyle; codeId: string | null }): KeptTerms | null {
  if (classOf(r.style) === 'product' && r.targets === null) return null
  const tiers = r.tierMins?.map((min, i) => ({ min, percentBps: r.tierPercentBps?.[i] ?? null, amountOff: r.tierAmountsOff?.[i] ?? null }))
  return {
    id: r.discountId, title: r.title, style: r.style, code: r.codeId, percentBps: r.percentBps, amountOff: r.amountOff, cap: r.cap, minSubtotal: r.minSubtotal,
    targets: r.targets === 'products' ? r.targetProducts ?? [] : 'all', buyQty: r.buyQty, getQty: r.getQty, getBps: r.getBps, giftVariantId: r.giftVariantId,
    ...(tiers?.length ? { tiers } : {}),
  }
}
