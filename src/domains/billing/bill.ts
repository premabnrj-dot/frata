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
import { currentPlan, feeForOrder, monthlyPrice, usage as planUsage, type PlanVersion } from '@/domains/plans/entitlements'
import { supplyKind } from '@/domains/tax/gst'

export const GST_BPS = 1800
/** Under this taxable value (₹100) a bill rolls to the next month, once in a row (unit-economics review). */
export const ROLL_BELOW = 10_000

export type PlanRow = { startsAt: Date; planVersion: Pick<PlanVersion, 'planCode' | 'monthlyPrice' | 'includedOrders' | 'feeBps'> & { name?: string }; trialEndsAt: Date | null; customMonthlyPrice: Paise | null }
export type AddonRow = { module: string; name: string; monthlyPrice: Paise; startsAt: Date; endsAt: Date | null; trialEndsAt: Date | null }
export type FeeOrder = { orderId: string; number: string; billableAt: Date; merchandiseNet: number }
export type FeeCredit = { orderId: string; number: string; fee: Paise; invoiceNumber: string | null }

export const LINE_KINDS = ['plan', 'addon', 'fee', 'over', 'credit', 'carry'] as const
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
  /** Orders billed before that are no longer billable, never credited. */
  credits: FeeCredit[]
  /** Paise carried in: a rolled bill's taxable value (positive) or a negative balance. */
  carry: number
  /** Whether last month's bill was itself rolled (a bill rolls at most once in a row). */
  rolledLastMonth: boolean
  /** Frrata's GSTIN and the shop's state code decide the heads (supplyKind); no GSTIN yet means IGST (test mode). */
  frrataGstin: string | null
  shopState: string | null
}

export type Bill = {
  lines: BillLine[]
  fees: BilledFee[]
  credited: { orderId: string; fee: Paise }[]
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

export function computeBill(i: BillInput): Bill {
  const lines: BillLine[] = []
  // The plan for M, in advance: each plan row in force during M, by its days; a trial is free for its days.
  const starts = [...i.plans].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
  const inMonth = starts.filter((p, k) => p.startsAt < i.nextMonthStart && (starts[k + 1]?.startsAt ?? i.nextMonthStart) > i.monthStart)
  for (const p of inMonth) {
    const k = starts.indexOf(p)
    const from = new Date(Math.max(p.startsAt.getTime(), i.monthStart.getTime()))
    const to = new Date(Math.min((starts[k + 1]?.startsAt ?? i.nextMonthStart).getTime(), i.nextMonthStart.getTime()))
    const paidFrom = p.trialEndsAt && p.trialEndsAt > from ? new Date(Math.min(p.trialEndsAt.getTime(), to.getTime())) : from
    const full = monthlyPrice({ ...p, trialEndsAt: null }, from)
    const price = byDays(full, paidFrom, to, i.monthStart, i.nextMonthStart)
    if (price > 0) lines.push({ kind: 'plan', description: `${p.planVersion.name ?? p.planVersion.planCode} plan`, periodStart: paidFrom, periodEnd: to, quantity: 1, rateBps: null, taxable: price })
  }
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
    const f = feeForOrder(i.plans, { merchandiseNet: o.merchandiseNet, billableAt: o.billableAt })
    return f ? [{ orderId: o.orderId, billableAt: o.billableAt, base: o.merchandiseNet as Paise, feeBps: f.feeBps, fee: f.fee }] : []
  })
  const byRate = new Map<number, BilledFee[]>()
  for (const f of fees) byRate.set(f.feeBps, [...(byRate.get(f.feeBps) ?? []), f])
  for (const [bps, fs] of [...byRate].sort((a, b) => b[0] - a[0])) {
    const base = fs.reduce((t, f) => t + f.base, 0)
    lines.push({ kind: 'fee', description: `Fee on delivered orders · ${fs.length} orders · ₹${(base / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, periodStart: i.prevMonthStart, periodEnd: i.monthStart, quantity: fs.length, rateBps: bps, taxable: fs.reduce((t, f) => t + f.fee, 0) as Paise })
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
  if (i.carry) lines.push({ kind: 'carry', description: i.carry > 0 ? 'Carried from last month' : 'Balance from last month', periodStart: i.prevMonthStart, periodEnd: i.monthStart, quantity: 1, rateBps: null, taxable: i.carry as Paise })

  const sum = lines.reduce((t, l) => t + l.taxable, 0)
  const credited = i.credits.map((c) => ({ orderId: c.orderId, fee: c.fee }))
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
