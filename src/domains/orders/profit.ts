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
//     COD fee where the courier charges it anyway, the ad spend already gone, and
//     on a prepaid order the gateway's fee, which a refund does not return); the
//     goods' cost too when they were NOT put back in stock (`restocked`, the
//     came-back event's own record): they are not on sale again (2026-11-12)
//   - `ifLost`: what it costs when the courier loses it (Ship S·0's "Lost by the courier"; unit-economics review
//     2026-11-08): the forward freight and the goods are gone, the gateway kept its fee; no return leg, no COD fee,
//     no platform fee. A courier's claim is not counted until something records it.
//   - `expected`: delivered and RTO weighted by the chance it is delivered
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
  /** What the gateway charged on this payment, its GST included (Razorpay's payment `fee`, which includes `tax`); 0 for COD.
   * Not bps of net revenue: Razorpay charges on the gross total, plus 18% GST (unit-economics review 2026-11-07). */
  gatewayFee: Paise
  /** Packaging, labels, inserts. Spent whether or not it is delivered. */
  packaging: Paise
  /** Ad spend attributed to this order. Spent whether or not it is delivered. */
  adCost: Paise
  /** The platform's own fee on a delivered order. */
  platformFee: Paise
  /** Whether a return's pieces went back on sale (its came-back event put the stock back). When not, `ifRto` loses
   * `cogs` as well. A caller asking before any outcome says what it assumes; there is no default. */
  restocked: boolean
}

export type OrderProfit = { ifDelivered: Paise; ifRto: Paise; ifLost: Paise; expected: Paise }

export function orderProfit(c: OrderCosts, deliveryProbability: number): OrderProfit {
  if (deliveryProbability < 0 || deliveryProbability > 1) {
    throw new Error(`[profit] deliveryProbability must be 0..1, got ${deliveryProbability}`)
  }
  const sunk = c.forwardShipping + c.packaging + c.adCost
  const ifDelivered = paise(
    c.netRevenue - c.cogs - sunk - c.codFee - c.gatewayFee - c.platformFee,
  )
  // Goods put back in stock are on sale again, so their cost is not lost (hypothesis H-resale: at full cost); goods
  // that came back and were not put back are lost like a lost parcel's. A prepaid return is refunded and the gateway
  // keeps its fee (unit-economics review 2026-11-08, as `ifLost`).
  const ifRto = paise(-(sunk + c.rtoShipping + c.codFee + c.gatewayFee + (c.restocked ? 0 : c.cogs)))
  const ifLost = paise(-(sunk + c.cogs + c.gatewayFee))
  const expected = paise(Math.round(ifDelivered * deliveryProbability + ifRto * (1 - deliveryProbability)))
  return { ifDelivered, ifRto, ifLost, expected }
}

/** Contribution per ₹100 of order value — the unit the business model speaks in. */
export function contributionPer100(profit: Paise, netRevenue: Paise): number {
  if (netRevenue === 0) return 0
  return Math.round((profit / netRevenue) * 100 * 100) / 100
}

/** Razorpay's standard rate on a payment, before GST (frata-unit-economics: 2% on prepaid). */
export const RAZORPAY_STANDARD_BPS = 200

/** Until the payment lands, an estimate of the gateway's fee: `bps` of the gross total, plus 18% GST on the fee. */
export function estimateGatewayFee(grossTotal: Paise, bps: number): Paise {
  const fee = applyBps(grossTotal, bps)
  return paise(fee + Math.round(fee * 0.18))
}
