// =============================================================================
// FILE: src/domains/analytics/totals.ts
//
// ANALYTICS' TOTALS (A·1): what a period, a source or a campaign adds up to, and how the list folds its long tail into
// one "Other" row (spec § Design 3). Pure; the query (src/lib/queries/analytics.ts) fills them, the page renders them.
// =============================================================================

import type { Kept } from '@/domains/orders/kept'
import type { Channel } from './source'

export type Totals = {
  orders: number; sales: number; cod: number
  delivered: number; rto: number; lost: number; onTheWay: number; notSent: number
  /** ₹ kept after returns (kept.ts), or null for a viewer who does not see costs. */
  kept: Kept | null
}

/** Sources beyond the first 12, and values a shopper typed, fold into one "Other" row (spec § Design 3). */
export function foldSources<S extends { channel: Channel; cur: Totals }>(sources: S[], keep = 12): { rows: S[]; other: Totals | null } {
  const shown = sources.filter((s) => s.channel !== 'other').slice(0, keep)
  const rest = sources.filter((s) => !shown.includes(s))
  if (!rest.length) return { rows: shown, other: null }
  const sum = (xs: Totals[]): Totals => {
    const kepts = xs.map((x) => x.kept).filter((k): k is Kept => !!k)
    const add = (f: (k: Kept) => number) => kepts.reduce((n, k) => n + f(k), 0)
    return {
      orders: xs.reduce((n, x) => n + x.orders, 0), sales: xs.reduce((n, x) => n + x.sales, 0), cod: xs.reduce((n, x) => n + x.cod, 0),
      delivered: xs.reduce((n, x) => n + x.delivered, 0), rto: xs.reduce((n, x) => n + x.rto, 0), lost: xs.reduce((n, x) => n + x.lost, 0),
      onTheWay: xs.reduce((n, x) => n + x.onTheWay, 0), notSent: xs.reduce((n, x) => n + x.notSent, 0),
      kept: kepts.length ? { kept: add((k) => k.kept), counted: add((k) => k.counted), leftOut: add((k) => k.leftOut), delivered: { n: add((k) => k.delivered.n), kept: add((k) => k.delivered.kept) }, rto: { n: add((k) => k.rto.n), kept: add((k) => k.rto.kept) }, lost: { n: add((k) => k.lost.n), kept: add((k) => k.lost.kept) }, basis: null } : null,
    }
  }
  return { rows: shown, other: sum(rest.map((s) => s.cur)) }
}
