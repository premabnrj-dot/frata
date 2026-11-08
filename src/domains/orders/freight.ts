// =============================================================================
// FILE: src/domains/orders/freight.ts
//
// WHAT SHIPPING COST AN ORDER, the ONE rule (Ship spec § Reviews 4, plan review 2, owner call S3). Profit (`profit.ts`)
// needs the forward freight, the return freight and the courier's COD fee. Chosen by how the parcel went:
//   - Shiprocket: the courier's statement lines (Ship S·3), actual; a line the outcome needs that has not arrived yet
//     takes the shop's confirmed estimate (labelled estimated); with no estimate the figure is PENDING, never ₹0;
//   - shipped another way, or not yet shipped: the shop's three confirmed estimates, marked estimated;
//   - with neither: freight is left out and the figure says so ("before shipping costs").
// Offers and Analytics read this through kept.ts, so they never disagree. Paise. Pure.
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
    if (provider === 'shiprocket' && facts.forwardShipping !== null) return { forwardShipping: paise(facts.forwardShipping), rtoShipping: paise(0), codFee: paise(0), source: 'actual' }
    // Shiprocket's forward line not arrived yet, or shipped another way: the confirmed estimate; else pending or none.
    return est ? { forwardShipping: paise(est.delivery), rtoShipping: paise(0), codFee: paise(0), source: 'estimate' } : zero(provider === 'shiprocket' ? 'pending' : 'none')
  }
  if (provider === 'shiprocket') {
    // A line the outcome needs and the statement has not brought yet: the forward freight; the return on a return; the
    // COD fee on a delivered COD order. Unknown is never ₹0: the shop's confirmed estimate stands in for the missing line
    // (labelled estimated; unit-economics review 2026-11-08: leaving the order out pulled ₹ kept down while returns
    // counted), and with no estimate the order is pending.
    const fwdMissing = facts.forwardShipping === null, rtoMissing = o.outcome === 'rto' && facts.rtoShipping === null
    const codMissing = o.cod && o.outcome === 'delivered' && facts.courierCodFee === null
    if (!fwdMissing && !rtoMissing && !codMissing) return { forwardShipping: paise(facts.forwardShipping!), rtoShipping: paise(facts.rtoShipping ?? 0), codFee: paise(facts.courierCodFee ?? 0), source: 'actual' }
    if (!est) return zero('pending')
    return {
      forwardShipping: paise(fwdMissing ? est.delivery : facts.forwardShipping!), rtoShipping: paise(rtoMissing ? est.ret : facts.rtoShipping ?? 0),
      codFee: paise(codMissing ? est.codFee : facts.courierCodFee ?? 0), source: 'estimate',
    }
  }
  if (!est) return zero('none')
  return { forwardShipping: paise(est.delivery), rtoShipping: paise(est.ret), codFee: paise(o.cod && o.outcome === 'delivered' ? est.codFee : 0), source: 'estimate' }
}
