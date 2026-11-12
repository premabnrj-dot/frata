// =============================================================================
// FILE: src/domains/orders/example.ts — the example order the public pages show (website spec W·1).
//
// One kurta set, pay on delivery, ₹2,490 to collect (5% GST inside). Its costs are named here, and what the
// brand keeps comes from orderProfit() — the same engine as every real order — never typed on a page. The
// platform fee is passed in from the plan the page shows.
// =============================================================================

import { type Paise, paise } from '@/domains/money/paise'
import { deliveredFee } from '@/domains/plans/entitlements'
import { LOW_BPS, split } from '@/domains/tax/gst'
import { orderProfit, type OrderCosts } from './profit'

/** What the shopper pays at the door, GST included. */
export const EXAMPLE_COLLECT = paise(249_000)
/** The example's assumptions, said on the page in a tip. */
export const EXAMPLE_COSTS = { cogs: paise(99_000), forwardShipping: paise(7_000), rtoShipping: paise(7_000), codFee: paise(4_000), packaging: paise(2_500), adCost: paise(18_000) } as const
/** The order without its GST (clothing under the slab: the low rate), through the tax engine. */
const NET = paise(split(EXAMPLE_COLLECT, LOW_BPS, true).taxable)

export type ExampleOrder = { collect: Paise; fee: Paise; ifDelivered: Paise; ifReturned: Paise }

export function exampleOrder(feeBps: number): ExampleOrder {
  const fee = deliveredFee(NET, feeBps)
  // The example's return is put back in stock (the usual case), so its cost is not lost.
  const c: OrderCosts = { netRevenue: NET, gatewayFee: paise(0), platformFee: fee, restocked: true, ...EXAMPLE_COSTS }
  const p = orderProfit(c, 1)
  return { collect: EXAMPLE_COLLECT, fee, ifDelivered: p.ifDelivered, ifReturned: p.ifRto }
}
