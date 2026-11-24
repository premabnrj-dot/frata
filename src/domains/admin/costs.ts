// =============================================================================
// FILE: src/domains/admin/costs.ts — ADMIN › COSTS: what Frrata pays (spec docs/specs/2026-11-23-admin-costs.md, plan
// docs/plans/2026-11-23-admin-costs.md task 1). Pure: no I/O, `today` is always an argument. Dates are IST calendar
// days as "YYYY-MM-DD" strings (they compare as text). Due dates, the next due, overdue, burn and the month's spend are
// DERIVED here from an item's anchor and its payments; none is stored. Each due date comes from the anchor
// (`addMonths(anchor, k × step)`), never from the date before it, so 31 Jan → 28 Feb → 31 Mar.
// Amounts are paise for INR and micro-dollars for USD (`MicroUsd`); a dollar total converts at the day's rate
// (rupees × 10,000) and rounds once, on the sum.
// =============================================================================
import { csvCell } from '@/domains/csv'
import { addMonths, monthKey } from '@/domains/time/month'

export const COST_CATEGORIES = ['infrastructure', 'ai', 'messaging', 'software', 'marketing', 'legal', 'people', 'design', 'other'] as const
export type CostCategory = (typeof COST_CATEGORIES)[number]
export const CATEGORY_WORDS: Record<CostCategory, string> = {
  infrastructure: 'Infrastructure', ai: 'AI', messaging: 'Messaging', software: 'Software', marketing: 'Marketing',
  legal: 'Legal', people: 'People', design: 'Design and brand', other: 'Other',
}
export const COST_KINDS = ['recurring', 'one_time'] as const
export const COST_CADENCES = ['monthly', 'quarterly', 'yearly'] as const
export type Cadence = (typeof COST_CADENCES)[number]
export const COST_CURRENCIES = ['INR', 'USD'] as const
/** Where a dollar cost may take its figure from: the vendors whose daily charges Admin › Infrastructure already reads (spec docs/specs/2026-11-23-costs-autofill.md). */
export const COST_SOURCES = ['vercel', 'mux'] as const
export type CostSource = (typeof COST_SOURCES)[number]
export const SOURCE_WORDS: Record<CostSource, string> = { vercel: 'Vercel', mux: 'Mux' }
export type CostCurrency = (typeof COST_CURRENCIES)[number]
export const CADENCE_WORDS: Record<Cadence, string> = { monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' }
const STEP: Record<Cadence, number> = { monthly: 1, quarterly: 3, yearly: 12 }

/** How far back a missed due is counted (and the most a read ever walks). */
export const LOOKBACK_MONTHS = 13
/** A cost is "soon" from this many days before its due date. */
export const SOON_DAYS = 7
/** The most Today shows. */
export const MAX_DUE_ROWS = 20
/** Overview's "due" window. */
export const HORIZON_DAYS = 30

export type CostItem = {
  id: string
  /** Null: typed by hand. Only a repeating dollar cost may name one. */
  source?: CostSource | null
  name: string
  kind: 'recurring' | 'one_time'
  cadence: Cadence | null
  /** Paise (INR) or micro-dollars (USD). */
  amount: number
  currency: CostCurrency
  varies: boolean
  anchorOn: string
  endsOn: string | null
  /** A `CostCategory` as stored (text + CHECK); typed loose so a read never throws on a future value. */
  category: string
  vendor?: string | null
  note?: string | null
}
export type CostPayment = { id: string; itemId: string; paidOn: string; periodFor: string; inrPaise: number; category: string }
/** A payment as the Admin library reads it (a CostPayment and what the panel and the CSV show). */
export type PaymentRow = CostPayment & { amount: number; currency: CostCurrency; gstPaise: number | null; createdAt: Date }

/** The most live repeating costs there can be: Overview reads them all. */
export const MAX_LIVE_COSTS = 500

/** What Add sends (already parsed by the action's Zod). A one-time cost carries its payment. */
export type CostItemInput =
  | { kind: 'recurring'; name: string; vendor?: string | null; category: CostCategory; cadence: Cadence; amount: number; currency: CostCurrency; varies: boolean; anchorOn: string; note?: string | null }
  | { kind: 'one_time'; name: string; vendor?: string | null; category: CostCategory; amount: number; currency: CostCurrency; paidOn: string; inrPaise?: number; gstPaise?: number | null; note?: string | null }
/** What Mark paid sends. For a dollar cost `amount` is micro-dollars and `inrPaise` what left the account. */
export type PaidInput = { periodFor: string; paidOn: string; amount: number; inrPaise?: number; gstPaise?: number | null; note?: string | null }

// ── Days ────────────────────────────────────────────────────────────────────────────────────────────────────────────

const toDate = (day: string) => new Date(`${day}T00:00:00Z`)
const toDay = (d: Date) => d.toISOString().slice(0, 10)
const DAY = 86_400_000
export const daysBetween = (from: string, to: string) => Math.round((toDate(to).getTime() - toDate(from).getTime()) / DAY)
const monthsBetween = (from: string, to: string) => (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7))

// ── Due dates ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Every due date of a repeating cost in [from, to], never before its anchor or after its end. */
export function dueDates(item: CostItem, from: string, to: string): string[] {
  if (item.kind !== 'recurring' || !item.cadence) return []
  const step = STEP[item.cadence]
  const last = item.endsOn && item.endsOn < to ? item.endsOn : to
  const anchor = toDate(item.anchorOn)
  const out: string[] = []
  for (let k = Math.max(0, Math.floor(monthsBetween(item.anchorOn, from) / step) - 1), n = 0; n < 1_200; k++, n++) {
    const d = toDay(addMonths(anchor, k * step))
    if (d > last) break
    if (d >= from) out.push(d)
  }
  return out
}

/** Whether a date is a real due date of the cost: the only dates a payment may settle. */
export const isDueDate = (item: CostItem, day: string) => dueDates(item, day, day).length === 1

/** The anchor may move only past the last paid period, so no paid bill turns into an overdue one. */
export const anchorMayMove = (next: string, lastPaidPeriod: string | null) => lastPaidPeriod === null || next > lastPaidPeriod

export const isLive = (item: CostItem, today: string) => item.endsOn === null || item.endsOn >= today

export type DueTone = 'overdue' | 'soon' | 'later'
export type DueState = {
  /** Unpaid dues on or before today, oldest first. */
  unpaid: string[]
  /** The first unpaid due, past or future; null for a one-time or a finished cost. */
  next: string | null
  tone: DueTone | null
  overdueDays: number
  inDays: number
}

/** Where a repeating cost stands: its paid periods are the only input besides the date. */
export function dueState(item: CostItem, paid: ReadonlySet<string>, today: string): DueState {
  const none: DueState = { unpaid: [], next: null, tone: null, overdueDays: 0, inDays: 0 }
  if (item.kind !== 'recurring' || !item.cadence) return none
  const back = toDay(addMonths(toDate(today), -LOOKBACK_MONTHS))
  const from = item.anchorOn > back ? item.anchorOn : back
  const dues = dueDates(item, from, toDay(addMonths(toDate(today), STEP[item.cadence] + 1))).filter((d) => !paid.has(d))
  const unpaid = dues.filter((d) => d <= today)
  const next = dues[0] ?? null
  if (!next) return { ...none, unpaid }
  if (next < today) return { unpaid, next, tone: 'overdue', overdueDays: daysBetween(next, today), inDays: 0 }
  const inDays = daysBetween(today, next)
  return { unpaid, next, tone: inDays <= SOON_DAYS ? 'soon' : 'later', overdueDays: 0, inDays }
}

export type DueRow = { id: string; name: string; next: string; tone: 'overdue' | 'soon' | 'later'; overdueDays: number; inDays: number; unpaidCount: number }

/** One row per live repeating cost that is overdue or due within `days` days, overdue first then by date. Today's source and
 *  the nav badge use the week (`SOON_DAYS`); Overview uses the month (`HORIZON_DAYS`): the same rule, one definition. */
export function dueRows(
  items: readonly CostItem[], paidByItem: ReadonlyMap<string, ReadonlySet<string>>, today: string,
  { days = SOON_DAYS, limit = MAX_DUE_ROWS }: { days?: number; limit?: number } = {},
): DueRow[] {
  const rows: DueRow[] = []
  for (const it of items) {
    if (!isLive(it, today)) continue
    const s = dueState(it, paidByItem.get(it.id) ?? new Set(), today)
    if (s.next && s.tone && (s.tone === 'overdue' || s.inDays <= days)) rows.push({ id: it.id, name: it.name, next: s.next, tone: s.tone, overdueDays: s.overdueDays, inDays: s.inDays, unpaidCount: s.unpaid.length })
  }
  return rows.sort((a, b) => a.next.localeCompare(b.next) || a.name.localeCompare(b.name)).slice(0, limit)
}

// ── Money ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Micro-dollars to paise at a rate in rupees × 10,000 (94.20 → 942,000), to the NEAREST paise, in bigint (a ₹1 crore bill
 *  times the rate passes 2^53). A bill that was paid rounds to nearest; Studio's list price (`listPaise`) rounds up on purpose. */
export const usdToPaise = (microUsd: number, rateE4: number) => Number((BigInt(microUsd) * BigInt(rateE4) + 50_000_000n) / 100_000_000n)

/** What a repeating cost is worth a month, in paise, unrounded; null for a one-time cost or a dollar cost with no rate. */
export function monthlyPaise(item: CostItem, rateE4: number | null): number | null {
  if (item.kind !== 'recurring' || !item.cadence) return null
  const step = STEP[item.cadence]
  if (item.currency === 'INR') return item.amount / step
  if (rateE4 === null) return null
  return (item.amount * rateE4) / 1e8 / step
}

export type Burn = { monthlyPaise: number; yearlyPaise: number; count: number; missingRate: number }

/** The monthly and yearly burn of every live repeating cost, summed at full precision and rounded once. */
export function burnOf(items: readonly CostItem[], today: string, rateE4: number | null): Burn {
  let sum = 0, count = 0, missingRate = 0
  for (const it of items) {
    if (it.kind !== 'recurring' || !isLive(it, today)) continue
    const m = monthlyPaise(it, rateE4)
    if (m === null) { missingRate++; continue }
    sum += m
    count++
  }
  return { monthlyPaise: Math.round(sum), yearlyPaise: Math.round(sum * 12), count, missingRate }
}

/** What was paid in an IST month ("2026-11"), in rupees paise. */
export function spentIn(payments: readonly CostPayment[], ym: string): { paise: number; count: number } {
  let paise = 0, count = 0
  for (const p of payments) if (p.paidOn.startsWith(ym)) { paise += p.inrPaise; count++ }
  return { paise, count }
}

/** A month's payments by category, biggest first. */
export function byCategory(payments: readonly CostPayment[], ym: string): { category: string; paise: number }[] {
  const m = new Map<string, number>()
  for (const p of payments) if (p.paidOn.startsWith(ym)) m.set(p.category, (m.get(p.category) ?? 0) + p.inrPaise)
  return [...m].map(([category, paise]) => ({ category, paise })).sort((a, b) => b.paise - a.paise || a.category.localeCompare(b.category))
}

// ── The financial year (April to March, IST days) ───────────────────────────────────────────────────────────────────

export const fyStartOf = (day: string) => (Number(day.slice(5, 7)) >= 4 ? Number(day.slice(0, 4)) : Number(day.slice(0, 4)) - 1)
export const fyRange = (startYear: number) => ({ from: `${startYear}-04-01`, to: `${startYear + 1}-03-31` })

// ── What a person types ─────────────────────────────────────────────────────────────────────────────────────────────

/** The most one cost may be: ₹1 crore in paise, or $50,000 in micro-dollars (₹1 crore at the band's top, ₹200 a dollar, so a
 *  dollar bill can always be recorded in rupees). */
export const AMOUNT_MAX = { INR: 1_000_000_000, USD: 50_000_000_000 } as const

/** "1,380" or "57.50" or "0.000125" → paise (INR, up to 2 decimals) or micro-dollars (USD, up to 6), exactly, never
 *  through a float; null when it is not an amount above zero, has too many decimals, or is over the ceiling. */
export function parseAmount(text: string, currency: CostCurrency): number | null {
  const m = /^(\d{1,12})(?:\.(\d{1,6}))?$/.exec(text.trim().replace(/[,\s₹$]/g, ''))
  if (!m) return null
  const decimals = currency === 'INR' ? 2 : 6
  const frac = m[2] ?? ''
  if (frac.length > decimals) return null
  const v = Number(m[1]) * 10 ** decimals + Number(frac.padEnd(decimals, '0'))
  return v >= 1 && v <= AMOUNT_MAX[currency] ? v : null
}

/** Rupees typed for a GST part or a dollar bill's rupees: paise, 0 allowed. */
export const parseRupees = (text: string): number | null => (/^\s*0+(\.0{1,2})?\s*$/.test(text) ? 0 : parseAmount(text, 'INR'))

/** A person's text, cleaned for storage and display: trimmed, control and bidi characters removed, spaces collapsed. */
export const cleanText = (text: string) =>
  text.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, ' ').replace(/\s+/g, ' ').trim()

/** A real "YYYY-MM-DD" (February 30th is not one), between 2020-01-01 and `max`. */
export function parseDay(text: string, max: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
  const d = new Date(`${text}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== text) return null
  return text >= '2020-01-01' && text <= max ? text : null
}

// ── The CA's CSV ────────────────────────────────────────────────────────────────────────────────────────────────────

const quote = (v: string | number) => csvCell(v)
const rupees = (p: number) => (p / 100).toFixed(2)
const dollars = (micro: number) => (micro / 1e6).toFixed(2)

/** One financial year's payments, oldest first: the cost, its vendor and category, the bill's day and period, what was
 *  billed, what left the account in rupees, and the GST part. Every cell quoted and formula-safe. */
export function costsCsv(rows: readonly (PaymentRow & { name: string; vendor: string | null })[], capped = false): string {
  const head = ['Cost', 'Vendor', 'Category', 'Paid on', 'For the bill due', 'Currency', 'Billed', 'In rupees', 'GST in rupees']
  const lines = rows.map((r) => [
    r.name, r.vendor ?? '', r.category, r.paidOn, r.periodFor, r.currency, r.currency === 'USD' ? dollars(r.amount) : rupees(r.amount), rupees(r.inrPaise), r.gstPaise === null ? '' : rupees(r.gstPaise),
  ].map(quote).join(','))
  return [head.map(quote).join(','), ...lines, ...(capped ? [quote(`Export capped at ${rows.length.toLocaleString('en-IN')} rows. Pick a shorter period.`)] : [])].join('\r\n') + '\r\n'
}

// ── Overview's figures ──────────────────────────────────────────────────────────────────────────────────────────────

export type Overview = {
  /** Overdue first, then due within the horizon; each with its due state and what it is worth in paise (null: dollars, no rate). */
  due: { row: DueRow; item: CostItem; state: DueState; paise: number | null }[]
  overdue: number
  /** Due in the next HORIZON_DAYS, not yet late: how many and what they come to (a dollar cost with no rate is counted, not summed). */
  coming: { count: number; paise: number }
  spent: { paise: number; count: number }
  burn: Burn
  month: string
  categories: { category: string; paise: number; before: number }[]
}

/** The Overview's figures, all from the due set, the payments and the rate: nothing here is stored. */
export function overview(items: readonly CostItem[], payments: readonly PaymentRow[], today: string, rate: number | null): Overview {
  const paidBy = new Map<string, Set<string>>()
  for (const p of payments) { const s = paidBy.get(p.itemId) ?? new Set<string>(); s.add(p.periodFor); paidBy.set(p.itemId, s) }
  const byId = new Map(items.map((i) => [i.id, i]))
  const paiseOf = (i: CostItem) => (i.currency === 'INR' ? i.amount : rate ? usdToPaise(i.amount, rate) : null)
  const due = dueRows(items, paidBy, today, { days: HORIZON_DAYS, limit: 500 }).map((row) => {
    const item = byId.get(row.id)!
    return { row, item, state: dueState(item, paidBy.get(item.id) ?? new Set(), today), paise: paiseOf(item) }
  })
  const late = due.filter((d) => d.row.tone === 'overdue')
  const ahead = due.filter((d) => d.row.tone !== 'overdue')
  const month = today.slice(0, 7)
  const prev = monthKey(today, -1)
  const before = new Map(byCategory(payments, prev).map((c) => [c.category, c.paise]))
  return {
    due, overdue: late.length,
    coming: { count: ahead.length, paise: ahead.reduce((t, d) => t + (d.paise ?? 0), 0) },
    spent: spentIn(payments, month), burn: burnOf(items, today, rate), month,
    categories: byCategory(payments, month).map((c) => ({ ...c, before: before.get(c.category) ?? 0 })),
  }
}

// ── A vendor's own figure for a bill ────────────────────────────────────────────────────────────────────────────────

/** The month a bill covers: vendors charge for usage in arrears, so a bill due in a month is for the month before it. */
export const billMonthOf = (due: string): string => monthKey(due, -1)

/** What a vendor's daily charges add up to in a month (`YYYY-MM`), in micro-dollars; null when no day of that month was read. */
export function monthMicros(rows: readonly { day: string; costMicros: number }[], ym: string): number | null {
  let sum = 0, seen = false
  for (const r of rows) if (r.day.slice(0, 7) === ym) { sum += r.costMicros; seen = true }
  return seen ? sum : null
}

/** A month is final once it has ended: a figure for the month still running is partial and is not offered. */
export const monthEnded = (ym: string, today: string): boolean => ym < today.slice(0, 7)
