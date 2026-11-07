// =============================================================================
// FILE: src/lib/format-date.ts (from Ekatan)
//
// A MOMENT, AS SOMEONE IN INDIA READS IT — always in Asia/Kolkata.
//
// ⚠️ NEVER toLocaleString WITHOUT A timeZone. Pages render on Vercel, whose
// clock is UTC, so an order placed at 10:33 pm IST reads "5:03 pm" without one.
// Ekatan learned this in production (2026-10-12). These are the one way to say it.
// =============================================================================

export const IST = 'Asia/Kolkata'

/** "12 Oct 2026" */
export const dayIN = (d: Date) =>
  d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: IST })

/** "12 Oct" — a date this year's reader needs no year on. */
export const dayMonthIN = (d: Date) =>
  d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: IST })

/** "Aug 2028" — a month a window ends in. */
export const monthYearIN = (d: Date) =>
  d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: IST })

/** "12 October" — said in a sentence to a customer. */
export const dayMonthLongIN = (d: Date) =>
  d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', timeZone: IST })

/** "12 Oct 2026, 10:33 pm" */
export const dateTimeIN = (d: Date) =>
  d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: IST })

/** How long ago, as a queue says it: "just now", "5 min ago", "2 h ago", else the day. */
export function sinceIN(at: Date | string, now: Date): string {
  const d = typeof at === 'string' ? new Date(at) : at
  const min = Math.floor((now.getTime() - d.getTime()) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  if (min < 24 * 60) return `${Math.floor(min / 60)} h ago`
  return dayMonthIN(d)
}
