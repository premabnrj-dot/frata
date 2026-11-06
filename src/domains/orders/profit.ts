// =============================================================================
// FILE: src/domains/orders/profit.ts
//
// PROFIT PER ORDER — the one formula. The console's order row, the order page,
// the analytics totals and the unit-economics report all call this; nobody
// recomputes a margin inline (ADR-0003, derive never duplicate).
//
// Two figures, because a COD order is a bet until it is delivered:
//   - `ifDelivered`: what the order earns when the customer accepts it
//   - `ifRto`: what it costs when it comes back (forward + return freight, the
//     COD fee where the courier charges it anyway, the ad spend already gone)
//   - `expected`: the two weighted by the chance it is delivered
//
// All inputs are paise. GST is outside: the merchant collects and remits it,
// so it is never contribution. Pure: no I/O, no dates, no defaults hidden here.
// =============================================================================

import { type Paise, paise, applyBps } from '@/domains/money/paise'

export type OrderCosts = {
  /** What the customer pays, excluding GST. */
  netRevenue: Paise
  /** Cost of the goods in the order. */
  cogs: Paise
  forwardShipping: Paise
  /** Charged only if the order returns to origin. */
  rtoShipping: Paise
  /** Courier COD handling fee; 0 for prepaid. */
  codFee: Paise
  /** Payment gateway fee in basis points of netRevenue; 0 for COD. */
  gatewayBps: number
  /** Packaging, labels, inserts. Spent whether or not it is delivered. */
  packaging: Paise
  /** Ad spend attributed to this order. Spent whether or not it is delivered. */
  adCost: Paise
  /** The platform's own fee on a delivered order. */
  platformFee: Paise
}

export type OrderProfit = { ifDelivered: Paise; ifRto: Paise; expected: Paise }

export function orderProfit(c: OrderCosts, deliveryProbability: number): OrderProfit {
  if (deliveryProbability < 0 || deliveryProbability > 1) {
    throw new Error(`[profit] deliveryProbability must be 0..1, got ${deliveryProbability}`)
  }
  const sunk = c.forwardShipping + c.packaging + c.adCost
  const ifDelivered = paise(
    c.netRevenue - c.cogs - sunk - c.codFee - applyBps(c.netRevenue, c.gatewayBps) - c.platformFee,
  )
  // The goods come back, so COGS is not lost; a fashion return is often not
  // resaleable at full value, which is the caller's to model in `cogs` later.
  const ifRto = paise(-(sunk + c.rtoShipping + c.codFee))
  const expected = paise(Math.round(ifDelivered * deliveryProbability + ifRto * (1 - deliveryProbability)))
  return { ifDelivered, ifRto, expected }
}

/** Contribution per ₹100 of order value — the unit the business model speaks in. */
export function contributionPer100(profit: Paise, netRevenue: Paise): number {
  if (netRevenue === 0) return 0
  return Math.round((profit / netRevenue) * 100 * 100) / 100
}
