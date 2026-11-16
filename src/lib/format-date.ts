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

/** en-IN writes September as "Sept"; Neel writes every month in three letters ("12 Nov", "13 Sep"; owner, 2026-11-15). */
const sep = (t: string) => t.replace(/\bSept\b/, 'Sep')

/** "12 Oct 2026" */
export const dayIN = (d: Date) =>
  sep(d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: IST }))

/** "Sat 14 Nov, 7 pm" (minutes only when not on the hour) — a drop's moment (Theme Studio TS1b's date block; Drop
 *  teaser keeps dayIN, its own pixels). The word before it ("Drops") is the shop's language (words.ts). */
export function dropLineIN(d: Date): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: IST })
    .formatToParts(d).map((x) => [x.type, x.value]))
  return `${p.weekday} ${p.day} ${sep(String(p.month))}, ${p.hour}${p.minute === '00' ? '' : `:${p.minute}`} ${String(p.dayPeriod).toLowerCase()}`
}

/** "12 Oct" — a date this year's reader needs no year on. */
export const dayMonthIN = (d: Date) =>
  sep(d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: IST }))

/** "November 2026" — a calendar's month (Neel's date field). */
export const monthLongYearIN = (d: Date) =>
  d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: IST })

/** "November" — a month named alone (Plan and billing's "November so far"). */
export const monthLongIN = (d: Date) =>
  d.toLocaleDateString('en-IN', { month: 'long', timeZone: IST })

/** "Aug" — a month in a table of recent months (Analytics' returning shoppers; the heading says which year). */
export const monthShortIN = (d: Date) =>
  d.toLocaleDateString('en-IN', { month: 'short', timeZone: IST }).slice(0, 3) // en-IN writes "Sept"; three letters, as drawn

/** "Aug 2028" — a month a window ends in. */
export const monthYearIN = (d: Date) =>
  sep(d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: IST }))

/** "12 October" — said in a sentence to a customer. */
export const dayMonthLongIN = (d: Date) =>
  d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', timeZone: IST })

/** "12 Oct 2026, 10:33 pm" */
export const dateTimeIN = (d: Date) =>
  sep(d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: IST }))

/** An IST calendar day key, "2026-11-15". */
const dayKeyIN = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: IST })

/** A moment in a list (Neel § Words): "Today, 10:06 pm", "Yesterday, 1:36 am", "13 Nov, 10:06 pm", the year only when
 *  not this year ("13 Nov 2025, 10:06 pm"). Today and Yesterday are IST calendar days, never now − 24 h. For live
 *  screens only: print, PDFs, CSVs and emails keep dateTimeIN, and a wait keeps sinceIN. */
export function momentIN(at: Date | string, now: Date): string {
  const d = typeof at === 'string' ? new Date(at) : at
  const time = timeIN(d).replace(/\s?([ap])\.?m\.?$/i, (_, x: string) => ` ${x.toLowerCase()}m`)
  const key = dayKeyIN(d), today = dayKeyIN(now)
  const yesterday = dayKeyIN(new Date(new Date(`${today}T12:00:00+05:30`).getTime() - 86_400_000))
  if (key === today) return `Today, ${time}`
  if (key === yesterday) return `Yesterday, ${time}`
  return `${key.slice(0, 4) === today.slice(0, 4) ? dayMonthIN(d) : dayIN(d)}, ${time}`
}

/** "7:42 pm" (IST): a time later today, as a wait says it (EkCode's "Try again at"). */
export const timeIN = (d: Date) =>
  d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: IST })

/** How long ago, as a queue says it: "just now", "5 min ago", "2 h ago", else the day. */
export function sinceIN(at: Date | string, now: Date): string {
  const d = typeof at === 'string' ? new Date(at) : at
  const min = Math.floor((now.getTime() - d.getTime()) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  if (min < 24 * 60) return `${Math.floor(min / 60)} h ago`
  return dayMonthIN(d)
}

/** How long something has waited, as a count says it: "just now", "25 min", "3 h", "2 d". */
export function waitedIN(at: Date | string, now: Date): string {
  const d = typeof at === 'string' ? new Date(at) : at
  const min = Math.floor((now.getTime() - d.getTime()) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min`
  if (min < 24 * 60) return `${Math.floor(min / 60)} h`
  return `${Math.floor(min / (24 * 60))} d`
}

/** "Sat": the short weekday of an IST date key ("2026-11-07"). */
export const weekdayShortIN = (dayKey: string) =>
  new Date(`${dayKey}T12:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', timeZone: IST })

/** "Saturday 7 November": today, as a page header says it. */
export const todayLongIN = (d: Date) =>
  d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: IST })
