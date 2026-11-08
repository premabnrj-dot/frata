// =============================================================================
// FILE: src/domains/orders/freight.ts
//
// WHAT SHIPPING COST AN ORDER, the ONE rule (Ship spec § Reviews 4, plan review 2, owner call S3). Profit (`profit.ts`)
// needs the forward freight, the return freight and the courier's COD fee. Chosen by how the parcel went:
//   - Shiprocket: the courier's statement lines (Ship S·3), actual; while a line the outcome needs has not arrived
//     (forward; the return on a return), the figure is PENDING, never ₹0;
//   - shipped another way, or not yet shipped: the shop's three confirmed estimates, marked estimated;
//   - with neither: freight is left out and the figure says so ("before shipping costs").
// Offers, Analytics and the order page all read this, so they never disagree. Paise. Pure.
// =============================================================================

import { type Paise, paise } from '@/domains/money/paise'

/** What the courier actually charged, as recorded on the order (null = no line yet). */
export type FreightFacts = { forwardShipping: number | null; rtoShipping: number | null; courierCodFee: number | null }

/** The shop's three estimates, only once it confirmed them (Settings › Shipping costs). */
export type ShipCostEstimate = { delivery: number; ret: number; codFee: number } | null

export type FreightSource = 'actual' | 'pending' | 'estimate' | 'none'
/** How the parcel ended: delivered, came back (RTO) or lost by the courier. */
export type Outcome = 'delivered' | 'rto' | 'lost'
export type Freight = { forwardShipping: Paise; rtoShipping: Paise; codFee: Paise; source: FreightSource }

const zero = (source: FreightSource): Freight => ({ forwardShipping: paise(0), rtoShipping: paise(0), codFee: paise(0), source })

/**
 * The freight for profit on one outcome. `provider`: the order's shipment ('self', 'shiprocket'), or null before it
 * shipped. `cod`: collected on delivery. An estimated COD fee is charged only when delivered (couriers reverse it on
 * a return; Shiprocket's actual lines already net the reversal).
 */
export function freightOf(provider: 'self' | 'shiprocket' | null, facts: FreightFacts, est: ShipCostEstimate, o: { cod: boolean; outcome: Outcome }): Freight {
  // Lost by the courier: only the forward leg was paid (no return, no COD fee collected).
  if (o.outcome === 'lost') {
    if (provider === 'shiprocket') return facts.forwardShipping === null ? zero('pending') : { forwardShipping: paise(facts.forwardShipping), rtoShipping: paise(0), codFee: paise(0), source: 'actual' }
    return est ? { forwardShipping: paise(est.delivery), rtoShipping: paise(0), codFee: paise(0), source: 'estimate' } : zero('none')
  }
  if (provider === 'shiprocket') {
    // A line the outcome needs and the statement has not brought yet: the forward freight; the return on a return; the
    // COD fee on a delivered COD order (unknown is never ₹0).
    if (facts.forwardShipping === null || (o.outcome === 'rto' && facts.rtoShipping === null) || (o.cod && o.outcome === 'delivered' && facts.courierCodFee === null)) return zero('pending')
    return { forwardShipping: paise(facts.forwardShipping), rtoShipping: paise(facts.rtoShipping ?? 0), codFee: paise(facts.courierCodFee ?? 0), source: 'actual' }
  }
  if (!est) return zero('none')
  return { forwardShipping: paise(est.delivery), rtoShipping: paise(est.ret), codFee: paise(o.cod && o.outcome === 'delivered' ? est.codFee : 0), source: 'estimate' }
}
