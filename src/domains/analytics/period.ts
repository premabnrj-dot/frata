// =============================================================================
// FILE: src/domains/analytics/period.ts — THE WINDOW ANALYTICS READS (Neel N1b; kit mockup § Period and comparison).
//
// One choice in the address (`?period=today|7|30|month` or `?from=2026-10-01&to=2026-10-31`), parsed here and nowhere
// else, becomes ONE window every read uses (orders and visits alike): `[start, end)` and the comparison, the same number
// of whole IST days just before it, `[prevStart, start)`. Today counts so far (end = now). A custom range is whole IST
// days, ends today at the latest, and is at most 366 days. An old `?period=90` link becomes the last 90 days as a
// custom range (the 90-day preset became Custom, owner 2026-11-15). Pure (check:layers).
// =============================================================================

import { istDayKey, istDayStart, IST_OFFSET_MS } from '@/domains/time/day'
import { monthStartIST } from '@/domains/time/month'

export const PRESETS = ['today', '7', '30', 'month'] as const
export type Preset = (typeof PRESETS)[number]
export type PeriodChoice = { kind: 'preset'; preset: Preset } | { kind: 'custom'; from: string; to: string }
export const MAX_CUSTOM_DAYS = 366

export type Window = {
  choice: PeriodChoice
  /** [start, end): the period; end is now when it runs to today. */
  start: Date; end: Date
  /** [prevStart, start): the same number of whole days just before. */
  prevStart: Date
  /** Whole IST days in the period (today counts as one). */
  days: number
  /** Whether the period runs to now (its last day is today, so far). */
  toNow: boolean
}

const DAY = 86_400_000
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s)
const dayStart = (key: string) => new Date(Date.parse(`${key}T00:00:00Z`) - IST_OFFSET_MS)

/** The period in an address; anything not understood is the last 30 days. */
export function parsePeriod(p: Record<string, string | string[] | undefined>, now: Date): PeriodChoice {
  const period = one(p.period)
  if ((PRESETS as readonly string[]).includes(period)) return { kind: 'preset', preset: period as Preset }
  const today = istDayKey(now)
  if (period === '90') return { kind: 'custom', from: istDayKey(istDayStart(now, -89)), to: today }
  let from = one(p.from), to = one(p.to)
  if (isDay(from) && isDay(to)) {
    if (from > to) [from, to] = [to, from]
    if (to > today) to = today
    if (from > today) from = today
    // At most a year: a longer range keeps its end and moves its start.
    const span = Math.round((dayStart(to).getTime() - dayStart(from).getTime()) / DAY) + 1
    if (span > MAX_CUSTOM_DAYS) from = istDayKey(new Date(dayStart(to).getTime() - (MAX_CUSTOM_DAYS - 1) * DAY))
    return { kind: 'custom', from, to }
  }
  return { kind: 'preset', preset: '30' }
}

/** The window a choice means at `now`. */
export function windowFor(choice: PeriodChoice, now: Date): Window {
  let start: Date, end: Date, toNow: boolean
  if (choice.kind === 'preset') {
    start = choice.preset === 'today' ? istDayStart(now) : choice.preset === 'month' ? monthStartIST(now) : istDayStart(now, -(Number(choice.preset) - 1))
    end = now; toNow = true
  } else {
    start = dayStart(choice.from)
    const after = new Date(dayStart(choice.to).getTime() + DAY)
    toNow = after.getTime() > now.getTime()
    end = toNow ? now : after
  }
  const days = Math.max(1, Math.round((istDayStart(new Date(end.getTime() - 1)).getTime() - start.getTime()) / DAY) + 1)
  return { choice, start, end, prevStart: new Date(start.getTime() - days * DAY), days, toNow }
}

/** The address of a choice (the picker's links). */
export function periodQuery(c: PeriodChoice): string {
  return c.kind === 'preset' ? `period=${c.preset}` : `from=${c.from}&to=${c.to}`
}

/** "vs previous 30 days", "vs yesterday", "vs the 13 days before": what every change is against, said once per row. */
export function compareWords(w: Window): string {
  if (w.choice.kind === 'preset' && w.choice.preset === 'today') return 'vs yesterday'
  if (w.choice.kind === 'preset' && w.choice.preset !== 'month') return `vs previous ${w.days} days`
  return w.days === 1 ? 'vs the day before' : `vs the ${w.days} days before`
}
