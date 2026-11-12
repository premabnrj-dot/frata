// =============================================================================
// FILE: src/domains/orders/kept.ts
//
// ₹ KEPT AFTER RETURNS: the ONE helper Offers and Analytics read (Analytics A·1, plan review 1–3; unit-economics
// review 2026-11-08). Over orders with an outcome: what delivered ones earned (`ifDelivered`), minus what returns
// (`ifRto`) and lost parcels (`ifLost`) cost, all from `orderProfit`, with freight from `freightOf`. Known costs only:
// orders carry no packaging or ad spend, so the figure is "before ads and packaging" and the page says so.
//
// It takes GROUPS, not orders (speed review, measured at 10×: per-order rows were 52.6 MB and 1.6 s): the SQL groups
// orders by what decides their figure (outcome, provider, COD, which costs are known, the fee in force) and sums the
// money; `orderProfit` is linear, so a group's figure is the sum of its orders' (the fee's per-order rounding aside).
// Left out, and counted as left out: a delivered or lost order with unknown COGS, and freight still pending from the
// courier (never read as ₹0). A return whose stock was put back needs no COGS (the goods are on sale again); a return
// NOT put back loses its COGS, so one with unknown COGS is left out too (2026-11-12; `restocked` comes from the
// came-back event, `rtoRestockedSql`). A group's COGS arrives net of the pieces credit notes put back in stock after
// delivery (`cogsSql`, src/lib/db/order-predicates.ts): they are on sale again. Pure.
// =============================================================================

import { type Paise, paise } from '@/domains/money/paise'
import { deliveredFee } from '@/domains/plans/entitlements'
import { freightOf, type FreightSource, type Outcome, type ShipCostEstimate } from './freight'
import { orderProfit } from './profit'

export type KeptGroup = {
  outcome: Outcome
  /** Orders in the group. */
  n: number
  provider: 'self' | 'shiprocket' | null
  cod: boolean
  /** A return whose came-back event put its stock back (`rtoRestockedSql`); false for every other outcome. */
  restocked: boolean
  /** Sums over the group's orders, in paise; null when its orders do not know it (the SQL groups known apart from unknown). */
  net: number
  /** COGS less the cost of pieces put back in stock by a credit note (cogsSql). */
  cogs: number | null
  forward: number | null
  rto: number | null
  courierCodFee: number | null
  gateway: number
  /** Merchandise net: what Frrata's per-delivered fee is charged on. */
  base: number
  /** The plan fee (bps) in force when the orders shipped (entitlements' `feeForOrder` pick, via
   * `feeBucketSql`), or null with no plan. The fee is charged on the group's merchandise net (billing rounds per order). */
  feeBps: number | null
}

export type KeptBasis = 'actual' | 'estimate' | 'none' | null

export type Kept = {
  /** ₹ kept after returns and lost parcels, in paise (known costs only), over the counted orders. */
  kept: number
  /** Orders counted (each with an outcome and known costs). */
  counted: number
  /** Orders with an outcome left out (unknown COGS, freight pending). */
  leftOut: number
  /** By outcome: how many were counted and what they left. */
  delivered: { n: number; kept: number }
  rto: { n: number; kept: number }
  lost: { n: number; kept: number }
  /** How freight was counted: all actual; some estimated; some with no shipping costs at all. Null when none counted. */
  basis: KeptBasis
}

const empty = (): Kept => ({ kept: 0, counted: 0, leftOut: 0, delivered: { n: 0, kept: 0 }, rto: { n: 0, kept: 0 }, lost: { n: 0, kept: 0 }, basis: null })

/** ₹ kept over the groups, with the shop's confirmed shipping-cost estimate (null: none confirmed). */
export function keptOf(groups: readonly KeptGroup[], est: ShipCostEstimate): Kept {
  const out = empty()
  const sources = new Set<FreightSource>()
  for (const g of groups) {
    if (g.n <= 0) continue
    const restocked = g.outcome === 'rto' && g.restocked
    if (!restocked && g.cogs === null) { out.leftOut += g.n; continue }
    // Actual lines are already the group's sums; an estimate is per parcel, so it is scaled to the group first (a
    // Shiprocket group can mix both: its missing lines take the estimate).
    const groupEst = est ? { delivery: est.delivery * g.n, ret: est.ret * g.n, codFee: est.codFee * g.n } : null
    const f = freightOf(g.provider, { forwardShipping: g.forward, rtoShipping: g.rto, courierCodFee: g.courierCodFee }, groupEst, { cod: g.cod, outcome: g.outcome })
    if (f.source === 'pending') { out.leftOut += g.n; continue }
    const p = orderProfit({
      netRevenue: paise(g.net), cogs: paise(g.cogs ?? 0),
      forwardShipping: f.forwardShipping, rtoShipping: f.rtoShipping, codFee: f.codFee,
      gatewayFee: paise(g.gateway), packaging: paise(0), adCost: paise(0),
      platformFee: g.outcome === 'delivered' && g.feeBps !== null ? deliveredFee(paise(g.base), g.feeBps) : paise(0),
      restocked,
    }, 1)
    const v: Paise = g.outcome === 'delivered' ? p.ifDelivered : g.outcome === 'rto' ? p.ifRto : p.ifLost
    out[g.outcome].n += g.n; out[g.outcome].kept += v
    out.kept += v; out.counted += g.n
    sources.add(f.source)
  }
  out.basis = out.counted === 0 ? null : sources.has('none') ? 'none' : sources.has('estimate') ? 'estimate' : 'actual'
  return out
}

/** ₹ kept per order with an outcome (the second figure a source is judged on; never per delivered order alone). */
export const keptPerOrder = (k: Kept) => (k.counted > 0 ? Math.round(k.kept / k.counted) : null)
