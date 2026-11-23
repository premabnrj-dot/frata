import { formatInr, formatUsd } from '@/lib/format'
import { paise } from '@/domains/money/paise'
import { dayMonthIN, monthLongIN, monthShortIN } from '@/lib/format-date'
import type { MicroUsd } from '@/domains/money/usd'
import type { CostCurrency, DueState } from '@/domains/admin/costs'

// =============================================================================
// FILE: src/app/(admin)/admin/costs/format.ts — how Admin › Costs shows a cost's figures and days (words per
// frata-design-language § Words; days through format-date, always IST).
// =============================================================================

/** "₹1,380", "₹1,299.50" or "$20.00": what a bill is, in the currency it was billed in. */
export const amountText = (amount: number, currency: CostCurrency) =>
  currency === 'INR' ? formatInr(paise(amount), { decimals: amount % 100 !== 0 }) : formatUsd(amount as MicroUsd)

/** A form field's starting value: "1380", "1299.5", "20.00". */
export function inputOf(amount: number, currency: CostCurrency): string {
  if (currency === 'INR') return String(amount / 100)
  const d = (amount / 1e6).toFixed(6).replace(/0+$/, '')
  return d.endsWith('.') ? `${d}00` : d.split('.')[1]!.length < 2 ? `${d}0` : d
}

/** "26 Nov" from a "2026-11-26" day. */
export const dayText = (day: string) => dayMonthIN(new Date(`${day}T12:00:00+05:30`))

/** The words and tone of a due state: "Overdue 3 days", "Today", "In 3 days", "In 21 days". */
export function whenOf(s: DueState): { tone: 'danger' | 'warn' | 'neutral'; text: string } | null {
  if (!s.next || !s.tone) return null
  if (s.tone === 'overdue') return { tone: 'danger', text: `Overdue ${s.overdueDays} ${s.overdueDays === 1 ? 'day' : 'days'}` }
  if (s.inDays === 0) return { tone: 'warn', text: 'Today' }
  return { tone: s.tone === 'soon' ? 'warn' : 'neutral', text: `In ${s.inDays} ${s.inDays === 1 ? 'day' : 'days'}` }
}

/** "November" from a "2026-11" month. */
export const monthLongName = (ym: string) => monthLongIN(new Date(`${ym}-15T12:00:00+05:30`))

/** "Nov" from a "2026-11" month. */
export const monthShortName = (ym: string) => monthShortIN(new Date(`${ym}-15T12:00:00+05:30`))
