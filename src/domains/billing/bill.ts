// =============================================================================
// FILE: src/domains/billing/bill.ts — WHAT FRRATA BILLS A SHOP FOR A MONTH (billing B0). Pure; money in paise.
//
// One invoice on the 1st of month M (spec docs/specs/2026-11-08-billing.md; plan § Review findings):
//   - the plan for M, in advance — the plan in force on the 1st; a trial or a plan starting mid-month by days;
//   - add-on modules for M, in advance, the same way;
//   - the fee on each order that became billable during M−1, in arrears — feeForOrder per order, rounded per order;
//   - orders over the plan in M−1: a ₹0 line, the count only (every delivered order already pays its fee);
//   - credits: the fee of an order billed before that is no longer billable (came back or lost later), reversed exactly;
//   - a carry from the month before (a rolled small bill, or a negative balance).
// GST at 18% on the taxable total, CGST + SGST when Frrata and the shop are in one state, IGST otherwise (each head
// on the taxable value; never rounded to the rupee). A taxable value under ₹100 rolls to the next month, once.
// =============================================================================

import { applyBps, type Paise } from '@/domains/money/paise'
import { currentPlan, deliveredFee, feeForOrder, monthlyPrice, usage as planUsage, type PlanVersion } from '@/domains/plans/entitlements'
import { supplyKind } from '@/domains/tax/gst'

export const GST_BPS = 1800
/** Under this taxable value (₹100) a bill rolls to the next month, once in a row (unit-economics review). */
export const ROLL_BELOW = 10_000

export type PlanRow = { startsAt: Date; planVersion: Pick<PlanVersion, 'planCode' | 'monthlyPrice' | 'includedOrders' | 'feeBps'> & { name?: string }; trialEndsAt: Date | null; customMonthlyPrice: Paise | null }
export type AddonRow = { module: string; name: string; monthlyPrice: Paise; startsAt: Date; endsAt: Date | null; trialEndsAt: Date | null }
/** `rateAt`: when the order shipped (its rate's moment); `billableAt`: when it is billed. */
export type FeeOrder = { orderId: string; number: string; billableAt: Date; rateAt: Date; merchandiseNet: number }
export type FeeCredit = { orderId: string; number: string; fee: Paise; invoiceNumber: string | null }

/**
 * What a billed order's fee gives back for items returned since it was billed (owner, 2026-11-12: a returned item
 * isn't billable): what was billed, less the fee on what was kept (the same rounding as any fee: deliveredFee), less
 * what returns already gave back. Never negative; never more than what is left of the billed fee.
 */
export function returnCreditDue(r: { billedFee: number; feeBps: number; merchandiseNet: number; returned: number; given: number }): Paise {
  const kept = deliveredFee(Math.max(0, r.merchandiseNet - r.returned) as Paise, r.feeBps)
  return Math.max(0, Math.min(r.billedFee - r.given, r.billedFee - kept - r.given)) as Paise
}

export const LINE_KINDS = ['plan', 'addon', 'fee', 'over', 'credit', 'carry', 'change'] as const
export type LineKind = (typeof LINE_KINDS)[number]
export type BillLine = { kind: LineKind; description: string; periodStart: Date; periodEnd: Date; quantity: number; rateBps: number | null; taxable: Paise }
export type BilledFee = { orderId: string; billableAt: Date; base: Paise; feeBps: number; fee: Paise }

export type BillInput = {
  /** The 1st of month M, 00:00 IST, as an instant. */
  monthStart: Date
  /** The 1st of month M+1. */
  nextMonthStart: Date
  /** The 1st of month M−1 (the fee's period). */
  prevMonthStart: Date
  plans: PlanRow[]
  addons: AddonRow[]
  /** Orders that became billable before monthStart and were never billed. */
  feeOrders: FeeOrder[]
  /** Orders billed before that are no longer billable, never credited (the fee left after any return credits). */
  credits: FeeCredit[]
  /** Billed orders whose items came back on a credit note since (owner, 2026-11-12: a returned item isn't billable):
   * the fee on the returned value not given back yet. Optional: none before the rule. */
  returnCredits?: FeeCredit[]
  /** Paise carried in: a rolled bill's taxable value (positive) or a negative balance. */
  carry: number
  /** Whether last month's bill was itself rolled (a bill rolls at most once in a row). */
  rolledLastMonth: boolean
  /**
   * What last month's invoice charged in advance for its plan (its plan lines for that month), or null when there was
   * no invoice for it. With it, an upgrade during last month is charged by its days here (billing B4).
   */
  prevPlanBilled?: number | null
  /** A paused shop pays no plan for these days (trials; from the pause until autopay reopens it). */
  pause?: Pause | null
  /** Frrata's GSTIN and the shop's state code decide the heads (supplyKind); no GSTIN yet means IGST (test mode). */
  frrataGstin: string | null
  shopState: string | null
}

export type Bill = {
  lines: BillLine[]
  fees: BilledFee[]
  credited: { orderId: string; fee: Paise; kind: 'outcome' | 'return' }[]
  taxable: Paise; cgst: Paise; sgst: Paise; igst: Paise; total: Paise
  /** Rolled: nothing is invoiced this month; `taxable` carries into the next. */
  rolled: boolean
  /** Negative: a balance carried forward, never refunded. */
  carryOut: number
  /** Over the plan in M−1 (billable orders against the included count of the plan in force at the end of M−1). */
  usage: { orders: number; included: number; over: boolean }
}

const DAY = 86_400_000
const days = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY)

/** A monthly price for the part of [from, to) it applies to, by days (a trial ending or a plan starting mid-month). */
function byDays(price: number, from: Date, to: Date, monthStart: Date, nextMonthStart: Date): Paise {
  const total = days(monthStart, nextMonthStart)
  const n = Math.max(0, Math.min(days(from, to), total))
  return Math.round((price * n) / total) as Paise
}

/** Days a paused shop pays no plan for (trials, owner 2026-11-08): from the pause until autopay reopens it. */
export type Pause = { from: Date; to: Date | null }

/** The plan rows in force during a month, each priced by its PAID days: a trial and a pause are free. */
export function planDays(plans: PlanRow[], monthStart: Date, nextMonthStart: Date, pause: Pause | null = null): { row: PlanRow; paidFrom: Date; to: Date; price: Paise }[] {
  const starts = [...plans].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
  const inMonth = starts.filter((p, k) => p.startsAt < nextMonthStart && (starts[k + 1]?.startsAt ?? nextMonthStart) > monthStart)
  return inMonth.map((p) => {
    const k = starts.indexOf(p)
    const from = new Date(Math.max(p.startsAt.getTime(), monthStart.getTime()))
    const to = new Date(Math.min((starts[k + 1]?.startsAt ?? nextMonthStart).getTime(), nextMonthStart.getTime()))
    const paidFrom = p.trialEndsAt && p.trialEndsAt > from ? new Date(Math.min(p.trialEndsAt.getTime(), to.getTime())) : from
    const full = monthlyPrice({ ...p, trialEndsAt: null }, from)
    let price = byDays(full, paidFrom, to, monthStart, nextMonthStart)
    if (pause) {
      const pf = Math.max(pause.from.getTime(), paidFrom.getTime()), pt = Math.min(pause.to?.getTime() ?? Infinity, to.getTime())
      if (pt > pf) price = Math.max(0, price - byDays(full, new Date(pf), new Date(pt), monthStart, nextMonthStart)) as Paise
    }
    return { row: p, paidFrom, to, price }
  })
}

/** A trial still running at `at` (the 1st of a month): that month's plan days are billed after it, in arrears (A2). */
export function trialRunsAt(plans: PlanRow[], at: Date): boolean {
  const p = currentPlan(plans, at)
  return !!p?.trialEndsAt && p.trialEndsAt > at
}

/**
 * THE ONE "MADE UP BY DAYS" RULE (B4 plan changes; trials A2): what a month's plans cost by their paid days, less what
 * its invoice already charged in advance for its plan; charged on the next invoice when more, never refunded. It
 * covers an upgrade during the month, and the plan days after a trial that ended in it (billed nothing in advance, as
 * nothing is billed while a trial runs on the 1st). Null `billed`: the month had no invoice, so nothing is made up.
 */
export function planChangeOwed(plans: PlanRow[], monthStart: Date, nextMonthStart: Date, billed: number | null, pause: Pause | null = null): Paise {
  if (billed == null) return 0 as Paise
  const owed = planDays(plans, monthStart, nextMonthStart, pause).reduce((t, d) => t + d.price, 0)
  return Math.max(0, owed - billed) as Paise
}

/**
 * What switching to `target` at `now` adds to the next bill, before GST: planChangeOwed with the change, less without
 * it — the figure the invoice will carry (the page's dialog reads this; never its own arithmetic).
 */
/** When a change the shop makes starts (app_change_plan's rule): an upgrade now, or when a running trial ends; a
 * downgrade on the next 1st. */
export function planChangeStarts(cur: PlanRow | undefined, target: PlanRow['planVersion'], now: Date, nextMonthStart: Date): Date {
  const up = cur ? target.monthlyPrice > cur.planVersion.monthlyPrice : true
  if (!up) return nextMonthStart
  return cur?.trialEndsAt && cur.trialEndsAt > now ? cur.trialEndsAt : now
}

export function planChangeAdds(plans: PlanRow[], target: PlanRow['planVersion'], now: Date, monthStart: Date, nextMonthStart: Date, billed: number | null): Paise {
  const cur = [...plans].filter((p) => p.startsAt <= now).sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())[0]
  const kept = plans.filter((p) => p.startsAt <= now)
  // As computeBill: a month a trial ran in counts as billed 0, even with no invoice yet (impact review TR0).
  if (billed == null && (trialRunsAt(kept, monthStart) || kept.some((p) => !!p.trialEndsAt && p.trialEndsAt > monthStart && p.trialEndsAt < nextMonthStart))) billed = 0
  // As app_change_plan (owner, 2026-11-08): an upgrade during a trial starts when the trial is over, with no trial.
  const startsAt = planChangeStarts(cur, target, now, nextMonthStart)
  const up = cur ? target.monthlyPrice > cur.planVersion.monthlyPrice : true
  const next: PlanRow = { startsAt, planVersion: target, trialEndsAt: !up && cur?.trialEndsAt && cur.trialEndsAt > startsAt ? cur.trialEndsAt : null, customMonthlyPrice: null }
  return Math.max(0, planChangeOwed([...kept, next], monthStart, nextMonthStart, billed) - planChangeOwed(kept, monthStart, nextMonthStart, billed)) as Paise
}

export function computeBill(i: BillInput): Bill {
  const lines: BillLine[] = []
  // The plan for M, in advance: each plan row in force during M, by its paid days (a trial and a pause are free) —
  // unless a trial still runs on the 1st: then M's plan days are billed next month, in arrears (trials A2), so nothing
  // is invoiced, and so nothing debited, for a month a trial is running in.
  const starts = [...i.plans].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
  if (!trialRunsAt(starts, i.monthStart)) for (const d of planDays(starts, i.monthStart, i.nextMonthStart, i.pause ?? null)) {
    if (d.price > 0) lines.push({ kind: 'plan', description: `${d.row.planVersion.name ?? d.row.planVersion.planCode} plan`, periodStart: d.paidFrom, periodEnd: d.to, quantity: 1, rateBps: null, taxable: d.price })
  }
  // M−1 made up by days (planChangeOwed, the one rule): an upgrade during it, or the plan after a trial that ended in
  // it. A trial that ran on M−1's 1st means its invoice billed no plan: 0, even if that month had no invoice at all.
  const prevTrial = trialRunsAt(starts, i.prevMonthStart) || starts.some((p) => !!p.trialEndsAt && p.trialEndsAt > i.prevMonthStart && p.trialEndsAt < i.monthStart)
  const owed = planChangeOwed(starts, i.prevMonthStart, i.monthStart, i.prevPlanBilled ?? (prevTrial ? 0 : null), i.pause ?? null)
  if (owed > 0) lines.push({ kind: 'change', description: prevTrial ? 'Your plan after the trial last month, by days' : 'Plan change last month: the difference, by days', periodStart: i.prevMonthStart, periodEnd: i.monthStart, quantity: 1, rateBps: null, taxable: owed })
  // Add-on modules for M, in advance, by their days.
  for (const a of i.addons) {
    const from = new Date(Math.max(a.startsAt.getTime(), i.monthStart.getTime(), a.trialEndsAt?.getTime() ?? 0))
    const to = new Date(Math.min(a.endsAt?.getTime() ?? Infinity, i.nextMonthStart.getTime()))
    if (to <= from) continue
    const price = byDays(a.monthlyPrice, from, to, i.monthStart, i.nextMonthStart)
    if (price > 0) lines.push({ kind: 'addon', description: a.name, periodStart: from, periodEnd: to, quantity: 1, rateBps: null, taxable: price })
  }
  // The fee on each newly billable order, rounded per order, grouped into one line per rate.
  const fees: BilledFee[] = i.feeOrders.flatMap((o) => {
    const f = feeForOrder(i.plans, { merchandiseNet: o.merchandiseNet, rateAt: o.rateAt, billableAt: o.billableAt })
    return f ? [{ orderId: o.orderId, billableAt: o.billableAt, base: o.merchandiseNet as Paise, feeBps: f.feeBps, fee: f.fee }] : []
  })
  const byRate = new Map<number, BilledFee[]>()
  for (const f of fees) byRate.set(f.feeBps, [...(byRate.get(f.feeBps) ?? []), f])
  for (const [bps, fs] of [...byRate].sort((a, b) => b[0] - a[0])) {
    const base = fs.reduce((t, f) => t + f.base, 0)
    lines.push({ kind: 'fee', description: `Fee on delivered orders · ${fs.length} order${fs.length === 1 ? "" : "s"} · ₹${(base / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, periodStart: i.prevMonthStart, periodEnd: i.monthStart, quantity: fs.length, rateBps: bps, taxable: fs.reduce((t, f) => t + f.fee, 0) as Paise })
  }
  // Orders over the plan in M−1: the count only.
  const endPlan = currentPlan(i.plans, new Date(i.monthStart.getTime() - 1))
  const included = endPlan?.planVersion.includedOrders ?? 0
  // Counted from what was billed: an order with no plan in force when it became billable is neither billed nor counted.
  const lastMonth = fees.filter((o) => o.billableAt >= i.prevMonthStart && o.billableAt < i.monthStart).length
  const u = planUsage(lastMonth, included)
  const usage = { orders: lastMonth, included, over: !!endPlan && u.over }
  if (usage.over) lines.push({ kind: 'over', description: `Orders over the plan · ${lastMonth - included}`, periodStart: i.prevMonthStart, periodEnd: i.monthStart, quantity: lastMonth - included, rateBps: null, taxable: 0 as Paise })
  // Credits: each reverses exactly what its order was billed.
  for (const c of i.credits) lines.push({ kind: 'credit', description: `${c.number} came back or was lost after billing${c.invoiceNumber ? ` (invoice ${c.invoiceNumber})` : ''}`, periodStart: i.prevMonthStart, periodEnd: i.monthStart, quantity: 1, rateBps: null, taxable: -c.fee as Paise })
  for (const c of i.returnCredits ?? []) if (c.fee > 0) lines.push({ kind: 'credit', description: `${c.number}: items returned after billing${c.invoiceNumber ? ` (invoice ${c.invoiceNumber})` : ''}`, periodStart: i.prevMonthStart, periodEnd: i.monthStart, quantity: 1, rateBps: null, taxable: -c.fee as Paise })
  if (i.carry) lines.push({ kind: 'carry', description: i.carry > 0 ? 'Carried from last month' : 'Balance from last month', periodStart: i.prevMonthStart, periodEnd: i.monthStart, quantity: 1, rateBps: null, taxable: i.carry as Paise })

  const sum = lines.reduce((t, l) => t + l.taxable, 0)
  const credited = [...i.credits.map((c) => ({ orderId: c.orderId, fee: c.fee, kind: 'outcome' as const })),
    ...(i.returnCredits ?? []).filter((c) => c.fee > 0).map((c) => ({ orderId: c.orderId, fee: c.fee, kind: 'return' as const }))]
  if (sum < 0) return { lines, fees, credited, taxable: 0 as Paise, cgst: 0 as Paise, sgst: 0 as Paise, igst: 0 as Paise, total: 0 as Paise, rolled: false, carryOut: sum, usage }
  if (sum < ROLL_BELOW && !i.rolledLastMonth) return { lines, fees, credited, taxable: sum as Paise, cgst: 0 as Paise, sgst: 0 as Paise, igst: 0 as Paise, total: 0 as Paise, rolled: true, carryOut: sum, usage }
  // Each head on the taxable value (plan finding 20), not one derived from another; the kind from supplyKind (gst.ts).
  // Not gstHeads (which splits one GST amount): finding 20 asks for each head on the taxable value.
  const intra = supplyKind(i.frrataGstin, i.shopState) === 'intra'
  const cgst = intra ? applyBps(sum as Paise, GST_BPS / 2) : (0 as Paise)
  const sgst = intra ? applyBps(sum as Paise, GST_BPS / 2) : (0 as Paise)
  const igst = intra ? (0 as Paise) : applyBps(sum as Paise, GST_BPS)
  return { lines, fees, credited, taxable: sum as Paise, cgst, sgst, igst, total: (sum + cgst + sgst + igst) as Paise, rolled: false, carryOut: 0, usage }
}
