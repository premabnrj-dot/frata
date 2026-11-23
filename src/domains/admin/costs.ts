// =============================================================================
// FILE: src/domains/admin/costs.ts — ADMIN › COSTS: what Frrata pays (spec docs/specs/2026-11-23-admin-costs.md, plan
// docs/plans/2026-11-23-admin-costs.md task 1). Pure: no I/O, `today` is always an argument. Dates are IST calendar
// days as "YYYY-MM-DD" strings (they compare as text). Due dates, the next due, overdue, burn and the month's spend are
// DERIVED here from an item's anchor and its payments; none is stored. Each due date comes from the anchor
// (`addMonths(anchor, k × step)`), never from the date before it, so 31 Jan → 28 Feb → 31 Mar.
// Amounts are paise for INR and micro-dollars for USD (`MicroUsd`); a dollar total converts at the day's rate
// (rupees × 10,000) and rounds once, on the sum.
// =============================================================================
import { addMonths } from '@/domains/time/month'

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
export type CostCurrency = (typeof COST_CURRENCIES)[number]
export const CADENCE_WORDS: Record<Cadence, string> = { monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' }
const STEP: Record<Cadence, number> = { monthly: 1, quarterly: 3, yearly: 12 }

/** How far back a missed due is counted (and the most a read ever walks). */
export const LOOKBACK_MONTHS = 13
/** A cost is "soon" from this many days before its due date. */
export const SOON_DAYS = 7
/** The most Today shows. */
export const MAX_DUE_ROWS = 20

export type CostItem = {
  id: string
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
export type PaymentRow = CostPayment & { amount: number; currency: string; gstPaise: number | null; createdAt: Date }

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

export type DueRow = { id: string; name: string; next: string; tone: 'overdue' | 'soon'; overdueDays: number; inDays: number; unpaidCount: number }

/** One row per live cost that is overdue or due within a week, overdue first then by date (Today and the nav badge). */
export function dueRows(items: readonly CostItem[], paidByItem: ReadonlyMap<string, ReadonlySet<string>>, today: string): DueRow[] {
  const rows: DueRow[] = []
  for (const it of items) {
    if (!isLive(it, today)) continue
    const s = dueState(it, paidByItem.get(it.id) ?? new Set(), today)
    if (s.next && (s.tone === 'overdue' || s.tone === 'soon')) rows.push({ id: it.id, name: it.name, next: s.next, tone: s.tone, overdueDays: s.overdueDays, inDays: s.inDays, unpaidCount: s.unpaid.length })
  }
  return rows.sort((a, b) => a.next.localeCompare(b.next) || a.name.localeCompare(b.name)).slice(0, MAX_DUE_ROWS)
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
