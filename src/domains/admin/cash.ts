// =============================================================================
// FILE: src/domains/admin/cash.ts — ADMIN › CASHFLOW'S ENGINE (spec docs/specs/2026-11-23-admin-cashflow.md § What is derived; plan
// docs/plans/2026-11-23-admin-cashflow.md task 2). Pure: `today` is an argument, days are IST "YYYY-MM-DD" strings, money is integer
// paise. ONE function, `monthRow`, makes every month's row (a past month from what happened, a coming month from what is due), so the
// table, the runway, the floor and the Today item all read the same series and no formula is written twice. Nothing here is stored.
// =============================================================================
import { cleanText, dueDates, usdToPaise, type CostItem } from './costs'
import { monthKey, monthRange } from '@/domains/time/month'

export const CASH_KINDS = ['funding', 'loan', 'grant', 'owner_capital', 'other_in', 'gst_paid', 'tds_paid', 'tax_paid', 'loan_repayment', 'owner_draw', 'other_out'] as const
export type CashKind = (typeof CASH_KINDS)[number]
/** Money in or out is the kind's, never stored beside it. */
export const KIND_DIRECTION: Record<CashKind, 'in' | 'out'> = {
  funding: 'in', loan: 'in', grant: 'in', owner_capital: 'in', other_in: 'in',
  gst_paid: 'out', tds_paid: 'out', tax_paid: 'out', loan_repayment: 'out', owner_draw: 'out', other_out: 'out',
}
export const KIND_WORDS: Record<CashKind, string> = {
  funding: 'Funding', loan: 'Loan received', grant: 'Grant', owner_capital: 'Owner capital', other_in: 'Other money in',
  gst_paid: 'GST paid', tds_paid: 'TDS paid', tax_paid: 'Tax paid', loan_repayment: 'Loan repayment', owner_draw: 'Owner draw', other_out: 'Other money out',
}
export const IN_KINDS = CASH_KINDS.filter((k) => KIND_DIRECTION[k] === 'in')
export const OUT_KINDS = CASH_KINDS.filter((k) => KIND_DIRECTION[k] === 'out')

export const FORECAST_MONTHS = 36
/** The most a balance, an entry or a floor may be: ₹100 crore in paise. */
export const CASH_MAX = 100_000_000_000

export type Balance = { id: string; accountId: string; asOf: string; paise: number; createdAt: string }
/** Planned means `happenedOn` is null (and `expectedOn` set): no status column. */
export type Entry = { id: string; kind: CashKind; amount: number; happenedOn: string | null; expectedOn: string | null; accountId: string | null }
export const isPlanned = (e: Entry) => e.happenedOn === null
export const signed = (e: Entry) => (KIND_DIRECTION[e.kind] === 'in' ? e.amount : -e.amount)
const entryMonth = (e: Entry) => (e.happenedOn ?? e.expectedOn ?? '').slice(0, 7)

// ── Cash in the bank ────────────────────────────────────────────────────────────────────────────────────────────────

/** The latest balance of each account: by (as of, created at, id), so a tie has one answer. */
export function latestBalances(balances: readonly Balance[]): Balance[] {
  const best = new Map<string, Balance>()
  for (const b of balances) {
    const cur = best.get(b.accountId)
    if (!cur || b.asOf > cur.asOf || (b.asOf === cur.asOf && (b.createdAt > cur.createdAt || (b.createdAt === cur.createdAt && b.id > cur.id)))) best.set(b.accountId, b)
  }
  return [...best.values()]
}

/** What came in and went out of the books between two days (after `from`, up to and including `to`): Billing and Costs sums
 *  are read by the lib for that window; entries that happened in it are added here. */
export type Window = { billingIn: number; costsOut: number }
export function entriesIn(entries: readonly Entry[], from: string, to: string): number {
  return entries.filter((e) => e.happenedOn !== null && e.happenedOn > from && e.happenedOn <= to).reduce((t, e) => t + signed(e), 0)
}

/** The books' figure for the main account at `date`: its latest balance plus money in less money out after that balance's day. Null
 *  when there is no main account, no balance for it, or the balance is dated after `date`. */
export function booksFigure(main: Balance | null, window: Window, entries: readonly Entry[], date: string): number | null {
  if (!main || main.asOf > date) return null
  return main.paise + window.billingIn - window.costsOut + entriesIn(entries, main.asOf, date)
}

/** A typed main-account balance less the books' figure; null when there is no books figure. */
export const differenceOf = (typed: number, books: number | null) => (books === null ? null : typed - books)

/** Cash today: the main account rolled forward to today, plus every other account's latest balance. */
export function cashToday(latest: readonly Balance[], mainId: string | null, window: Window, entries: readonly Entry[], today: string): number {
  let sum = 0
  for (const b of latest) {
    if (b.accountId === mainId) sum += booksFigure(b, window, entries, today) ?? b.paise
    else sum += b.paise
  }
  return sum
}

// ── Money by month ──────────────────────────────────────────────────────────────────────────────────────────────────

/** The average of the last three full months of billing money in, from the first month with any (zero months after it count). */
export function runRate(billingByMonth: Readonly<Record<string, number>>, today: string): number {
  const first = Object.keys(billingByMonth).filter((m) => (billingByMonth[m] ?? 0) > 0).sort()[0]
  if (!first) return 0
  const months = [1, 2, 3].map((i) => monthKey(today, -i)).filter((m) => m >= first)
  if (!months.length) return 0
  return Math.round(months.reduce((t, m) => t + (billingByMonth[m] ?? 0), 0) / months.length)
}

/** GST to pay on a month's billing money in: the share inside an amount that carries GST at `bps` (1800 = 18%). */
export const gstShare = (billing: number, bps: number) => Math.round((billing * bps) / (10_000 + bps))

/** What every repeating cost comes to in each month from its due dates (dollars at the typed rate); a dollar cost with no rate is counted in `unrated`. */
export function dueCostsByMonth(items: readonly CostItem[], rate: number | null, fromMonth: string, months: number): { byMonth: Record<string, number>; unrated: number } {
  const byMonth: Record<string, number> = {}
  let unrated = 0
  const from = `${fromMonth}-01`
  const to = monthRange(monthKey(`${fromMonth}-01`, months - 1)).to
  for (const it of items) {
    if (it.kind !== 'recurring') continue
    const dues = dueDates(it, from, to)
    if (!dues.length) continue
    const p = it.currency === 'INR' ? it.amount : rate ? usdToPaise(it.amount, rate) : null
    if (p === null) { unrated++; continue }
    for (const d of dues) byMonth[d.slice(0, 7)] = (byMonth[d.slice(0, 7)] ?? 0) + p
  }
  return { byMonth, unrated }
}

export type CashModel = {
  today: string
  /** Billing money in by month, net of refunds (actual). */
  billingByMonth: Readonly<Record<string, number>>
  /** Costs paid by month, in rupees (actual). */
  costsByMonth: Readonly<Record<string, number>>
  /** What the repeating costs come to in each coming month (`dueCostsByMonth`). */
  dueCosts: Readonly<Record<string, number>>
  entries: readonly Entry[]
  /** GST on invoices actually issued: due this month, and due next month. Null: estimate from billing. */
  gstActual: { thisMonth: number | null; nextMonth: number | null }
  gstBps: number
}

export type MonthRow = { month: string; actual: boolean; opening: number; billing: number; otherIn: number; costs: number; gst: number; otherOut: number; closing: number }

/** One month, from what happened (before this month) or what is due (this month's rest is in the opening; later months here). */
export function monthRow(month: string, opening: number, m: CashModel): MonthRow {
  const thisMonth = m.today.slice(0, 7)
  const actual = month < thisMonth
  const entries = m.entries.filter((e) => entryMonth(e) === month && (actual ? !isPlanned(e) : isPlanned(e)))
  const otherIn = entries.filter((e) => KIND_DIRECTION[e.kind] === 'in').reduce((t, e) => t + e.amount, 0)
  const entryOut = entries.filter((e) => KIND_DIRECTION[e.kind] === 'out').reduce((t, e) => t + e.amount, 0)
  if (actual) {
    const billing = m.billingByMonth[month] ?? 0, costs = m.costsByMonth[month] ?? 0
    return { month, actual, opening, billing, otherIn, costs, gst: 0, otherOut: entryOut, closing: opening + billing + otherIn - costs - entryOut }
  }
  const rate = runRate(m.billingByMonth, m.today)
  const gst = month === monthKey(m.today, 1) ? (m.gstActual.nextMonth ?? gstShare(rate, m.gstBps)) : gstShare(rate, m.gstBps)
  const costs = m.dueCosts[month] ?? 0
  return { month, actual, opening, billing: rate, otherIn, costs, gst, otherOut: entryOut, closing: opening + rate + otherIn - costs - gst - entryOut }
}

/** The forecast's opening: cash today, less costs still unpaid to the end of this month (overdue ones included), less this month's GST unless a
 *  `gst_paid` entry already sits in it, plus or minus planned entries to the month's end. */
export function openingOf(cash: number, unpaidCostsToMonthEnd: number, m: CashModel): number {
  const thisMonth = m.today.slice(0, 7)
  const gstPaid = m.entries.some((e) => e.kind === 'gst_paid' && !isPlanned(e) && entryMonth(e) === thisMonth)
  const gstThis = gstPaid ? 0 : (m.gstActual.thisMonth ?? gstShare(m.billingByMonth[monthKey(m.today, -1)] ?? 0, m.gstBps))
  const planned = m.entries.filter((e) => isPlanned(e) && entryMonth(e) <= thisMonth).reduce((t, e) => t + signed(e), 0)
  return cash - unpaidCostsToMonthEnd - gstThis + planned
}

/** Costs still unpaid to the end of this month: every due date up to then that no payment settles. */
export function unpaidCostsToMonthEnd(items: readonly CostItem[], paidBy: ReadonlyMap<string, ReadonlySet<string>>, rate: number | null, today: string): number {
  const end = monthRange(today.slice(0, 7)).to
  const from = `${monthKey(today, -13)}-01`
  let sum = 0
  for (const it of items) {
    if (it.kind !== 'recurring') continue
    const paid = paidBy.get(it.id) ?? new Set<string>()
    const p = it.currency === 'INR' ? it.amount : rate ? usdToPaise(it.amount, rate) : 0
    for (const d of dueDates(it, from, end)) if (!paid.has(d)) sum += p
  }
  return sum
}

/** The coming months, `months` of them, from the month after this one. */
export function forecast(opening: number, m: CashModel, months = FORECAST_MONTHS): MonthRow[] {
  const rows: MonthRow[] = []
  let bal = opening
  for (let i = 1; i <= months; i++) {
    const r = monthRow(monthKey(m.today, i), bal, m)
    rows.push(r)
    bal = r.closing
  }
  return rows
}

/** The first month whose closing is below zero; null when none in the series. */
export const runwayEnd = (rows: readonly MonthRow[]) => rows.find((r) => r.closing < 0)?.month ?? null
/** The first month whose closing is under the floor; null with no floor or none below. */
export const firstBelow = (rows: readonly MonthRow[], floor: number | null) => (floor === null ? null : rows.find((r) => r.closing < floor)?.month ?? null)
/** Net each month: the average of the last three full months of actual in less out. */
export function averageNet(m: CashModel): number | null {
  const months = [1, 2, 3].map((i) => monthKey(m.today, -i))
  const first = Object.keys({ ...m.billingByMonth, ...m.costsByMonth }).sort()[0]
  const used = months.filter((x) => first !== undefined && x >= first)
  if (!used.length) return null
  const net = used.reduce((t, x) => { const r = monthRow(x, 0, m); return t + (r.closing - 0) }, 0)
  return Math.round(net / used.length)
}

// ── What a person types ─────────────────────────────────────────────────────────────────────────────────────────────

/** A balance as typed ("2,95,000", "-17,400.50", "−5000"): signed paise, zero allowed, up to ₹100 crore either way; null when it is not one. */
export function parseBalance(text: string): number | null {
  const m = /^([-−]?)(\d{1,12})(?:\.(\d{1,2}))?$/.exec(text.trim().replace(/[,\s₹]/g, ''))
  if (!m) return null
  const v = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0'))
  if (v > CASH_MAX) return null
  return m[1] ? -v : v
}

/** An entry's amount or the floor, as typed: paise above zero up to ₹100 crore (the floor may be zero: `allowZero`). */
export function parseCashAmount(text: string, allowZero = false): number | null {
  const v = parseBalance(text)
  if (v === null || v < 0 || (v === 0 && !allowZero)) return null
  return v
}

/** A person's text for storage: trimmed, control and direction characters removed, spaces collapsed (the Costs cleaner, one copy). */
export const cleanTextLocal = cleanText
