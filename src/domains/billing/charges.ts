// =============================================================================
// FILE: src/domains/billing/charges.ts — WHAT A BILL IS MADE OF, AS THE MERCHANT READS IT (billing rework R1; spec
// docs/specs/2026-11-15-billing-rework.md § Charges). Pure: a bill's stored lines (or the estimate's) in, the summary
// rows that add up to it out. One mapping of line kinds to what a merchant calls them, one "delivered sales", one
// cost share, one plan cost at a sales figure (deliveredFee's rounding). Nothing here is stored.
// =============================================================================

import type { Paise } from '@/domains/money/paise'
import { deliveredFee } from '@/domains/plans/entitlements'
import type { LineKind } from './bill'

/** What a merchant calls each line kind. `over` is a count with no money (orders over the plan): never shown (owner,
 *  2026-11-15: "orders included" leaves merchant pages). */
export type ChargeGroup = 'plan' | 'apps' | 'fees' | 'credits' | 'carry'
export const GROUP_OF: Record<LineKind, ChargeGroup | null> = {
  plan: 'plan', change: 'plan', addon: 'apps', fee: 'fees', credit: 'credits', carry: 'carry', over: null,
}
export const GROUP_ORDER: readonly ChargeGroup[] = ['plan', 'apps', 'fees', 'credits', 'carry']

export type ChargeLine = { kind: string; description: string; quantity: number; rateBps: number | null; taxable: number }
export type ChargeRow = { group: ChargeGroup; taxable: Paise; lines: ChargeLine[] }
export type Heads = { cgst: number; sgst: number; igst: number; total: number }

export type Summary = {
  rows: ChargeRow[]
  /** The sum of the rows; equals the bill's taxable value (`adds`). */
  beforeGst: Paise
  cgst: Paise; sgst: Paise; igst: Paise; total: Paise
  /** True when the rows add up to the bill's own taxable value and the heads to its total (the page never shows a
   *  summary that does not reconcile: it falls back to the plain lines). */
  adds: boolean
}

const groupOf = (kind: string): ChargeGroup | null => (kind in GROUP_OF ? GROUP_OF[kind as LineKind] : null)

/** The bill's lines grouped as the merchant reads them, in a fixed order; empty groups left out. */
export function summarize(lines: readonly ChargeLine[], taxable: number, heads: Heads): Summary {
  const rows: ChargeRow[] = []
  for (const g of GROUP_ORDER) {
    const of = lines.filter((l) => groupOf(l.kind) === g)
    if (of.length) rows.push({ group: g, taxable: of.reduce((t, l) => t + l.taxable, 0) as Paise, lines: of })
  }
  const beforeGst = rows.reduce((t, r) => t + r.taxable, 0) as Paise
  return {
    rows, beforeGst,
    cgst: heads.cgst as Paise, sgst: heads.sgst as Paise, igst: heads.igst as Paise, total: heads.total as Paise,
    adds: beforeGst === taxable && taxable + heads.cgst + heads.sgst + heads.igst === heads.total,
  }
}

/** Delivered sales a bill's fee was charged on: the billed bases, less the bases of orders credited on it. */
export function deliveredSales(fees: readonly { base: number }[], credits: readonly { base: number }[] = []): Paise {
  return Math.max(0, fees.reduce((t, f) => t + f.base, 0) - credits.reduce((t, c) => t + c.base, 0)) as Paise
}

/** The delivered sales a fee credit took back: the whole billed base when the order came back or was lost
 *  ('outcome'); for returned items ('return') only their part, the credited fee at the order's rate. */
export function creditedBase(c: { kind: string; fee: number; base: number; feeBps: number }): Paise {
  if (c.kind !== 'return' || c.feeBps <= 0) return c.base as Paise
  return Math.min(c.base, Math.round((c.fee * 10_000) / c.feeBps)) as Paise
}

/** What Frrata cost as a share of delivered sales, in basis points; null when there were no sales to divide by. */
export function costShareBps(taxable: number, sales: number): number | null {
  return sales > 0 ? Math.round((taxable * 10_000) / sales) : null
}

/** A plan's monthly cost before GST at a month of delivered sales: its price plus its fee, rounded as a bill rounds. */
export function planCostAt(sales: Paise, plan: { monthlyPrice: number; feeBps: number }): Paise {
  return (plan.monthlyPrice + deliveredFee(sales, plan.feeBps)) as Paise
}

/** The plan whose cost at `sales` is lowest (the first listed wins a tie: the cheaper price). */
export function cheapestAt<P extends { monthlyPrice: number; feeBps: number }>(sales: Paise, plans: readonly P[]): P | null {
  let best: P | null = null, cost = Infinity
  for (const p of plans) { const c = planCostAt(sales, p); if (c < cost) { best = p; cost = c } }
  return best
}

/** One bill as a bar of the cost chart: plan and apps, then fees less credits (carry left out: it is no month's cost). */
export function costBar(lines: readonly { kind: string; taxable: number }[]): { plan: Paise; fees: Paise } {
  let plan = 0, fees = 0
  for (const l of lines) {
    const g = groupOf(l.kind)
    if (g === 'plan' || g === 'apps') plan += l.taxable
    else if (g === 'fees' || g === 'credits') fees += l.taxable
  }
  return { plan: plan as Paise, fees: Math.max(0, fees) as Paise }
}
