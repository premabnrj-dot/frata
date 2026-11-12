// =============================================================================
// FILE: src/domains/billing/ladder.ts — the pricing ladder's nudge (Apps A2, plan docs/plans/2026-11-11-apps-a2-homes.md
// § 4; unit-economics review 2026-11-11). Reads ISSUED bills, never makes one: what a Launch shop's last two invoices
// would have been on Growth or Scale, from the stored per-order fee bases, rounded per order as the bill rounds.
// =============================================================================

import type { Paise } from '@/domains/money/paise'
import { deliveredFee, type PlanCode } from '@/domains/plans/entitlements'

export type LadderPlan = { code: PlanCode; name: string; monthlyPrice: Paise; feeBps: number
  /** The add-ons this plan includes, by their bill-line name (MODULES[k].name): billed on Launch, nothing here. */
  includes?: readonly string[] }

/** One issued invoice as the ladder reads it (the caller reads only issued, non-test invoices). */
export type LadderInvoice = {
  id: string
  periodStart: Date
  /** The invoice's taxable total (what the shop was billed before GST). */
  taxable: Paise
  lines: readonly { kind: string; periodStart: Date; taxable: Paise; name?: string }[]
  /** One row per billed order: its stored base and the fee billed on it. */
  fees: readonly { base: Paise; fee: Paise }[]
  /** One row per credited order: the base its fee was billed on, and the fee credited. */
  credits: readonly { base: Paise; fee: Paise }[]
}

/** The floor below which no card shows, before GST (unit-economics review: ₹590 with GST, on both invoices). */
export const NUDGE_FLOOR = 50_000 as Paise

/** The plan line and its fees on this invoice, on its own plan (Launch) — exactly as billed. */
function billedOn(inv: LadderInvoice, launch: LadderPlan): number | null {
  const plan = inv.lines.filter((l) => l.kind === 'plan')
  if (plan.length !== 1 || inv.lines.some((l) => l.kind === 'change')) return null
  const p = plan[0]!
  // A full month on Launch at its list price (a custom price or a part month is never compared with a list price).
  if (p.periodStart.getTime() !== inv.periodStart.getTime() || p.taxable !== launch.monthlyPrice) return null
  if (!inv.fees.length) return null
  return p.taxable + sum(inv.fees.map((f) => f.fee)) - sum(inv.credits.map((c) => c.fee))
}

/** The same lines on another plan: its price, its fee on each order's base, its credits, minus the add-ons it
 *  includes (Delivery Zones on Growth: unit-economics review 2026-11-12). Carry and over are equal. */
function wouldBeOn(inv: LadderInvoice, plan: LadderPlan): number {
  const included = sum(inv.lines.filter((l) => l.kind === 'addon' && !!l.name && (plan.includes ?? []).some((n) => l.name === n || l.name!.startsWith(`${n},`))).map((l) => l.taxable))
  return plan.monthlyPrice + sum(inv.fees.map((f) => deliveredFee(f.base, plan.feeBps))) - sum(inv.credits.map((c) => deliveredFee(c.base, plan.feeBps))) - included
}

export type Nudge = { plan: LadderPlan; invoiceId: string; periodStart: Date; saving: Paise; billed: Paise; would: Paise }

/**
 * The cheapest plan for a Launch shop, from its last TWO issued invoices (newest first): named only when it saves at
 * least NUDGE_FLOOR on BOTH (a festive month alone never triggers it), and then the one that saves the most on the
 * newest. `billed` is the newest invoice's taxable total; `would` = billed − saving.
 */
export function cheapestPlan(invoices: readonly LadderInvoice[], launch: LadderPlan, others: readonly LadderPlan[]): Nudge | null {
  if (invoices.length < 2) return null
  const [newest, before] = invoices as [LadderInvoice, LadderInvoice]
  const a = billedOn(newest, launch), b = billedOn(before, launch)
  if (a === null || b === null) return null
  let best: Nudge | null = null
  for (const plan of others) {
    const s1 = a - wouldBeOn(newest, plan), s2 = b - wouldBeOn(before, plan)
    if (s1 < NUDGE_FLOOR || s2 < NUDGE_FLOOR) continue
    if (!best || s1 > best.saving) best = { plan, invoiceId: newest.id, periodStart: newest.periodStart, saving: s1 as Paise, billed: newest.taxable, would: (newest.taxable - s1) as Paise }
  }
  return best
}

const sum = (xs: readonly number[]) => xs.reduce((t, x) => t + x, 0)
