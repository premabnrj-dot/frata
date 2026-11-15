import { paise } from '@/domains/money/paise'
import type { ShipCostEstimate } from './freight'
import { orderKeep } from './kept'

// =============================================================================
// FILE: src/domains/orders/offer-cost.ts — WHAT AN OFFER COSTS ON ONE PIECE (Neel N2b·2, the offer form's side card).
// One piece of the store's best seller, sold alone, delivered: what it keeps with no offer, and what each rupee off
// takes from that, through orderKeep (GST inside the price, goods, courier estimate, Frrata's fee on the taxable value).
// Only these two derived figures reach the browser, never the goods' cost. Linear in the amount off while the GST rate
// stays the same (a slab code can step across ₹2,500; the card says "about"). Before ads, packaging and gateway fees.
// =============================================================================

export type OfferExample = { keptAt0: number; perRupee: number }

export function offerExample(p: { price: number; gstBps: number; inclusive: boolean; cogs: number; est: ShipCostEstimate; feeBps: number | null }): OfferExample | null {
  const at = (off: number) => {
    const total = Math.max(0, p.price - off)
    const taxable = p.inclusive ? Math.round((total * 10_000) / (10_000 + p.gstBps)) : total
    const k = orderKeep({ provider: null, cod: false, net: taxable, cogs: p.cogs, forward: null, rto: null, courierCodFee: null, gateway: 0, base: taxable, feeBps: p.feeBps }, p.est)
    return k.ifDelivered
  }
  const zero = at(0), hundred = at(10_000)
  if (zero === null || hundred === null) return null
  return { keptAt0: zero, perRupee: (zero - hundred) / 10_000 }
}

/** What the piece keeps with `off` paise off it (the card's second figure). */
export const keptWithOff = (x: OfferExample, off: number) => paise(Math.round(x.keptAt0 - off * x.perRupee))
