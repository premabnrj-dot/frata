// =============================================================================
// FILE: src/domains/orders/today.ts
//
// WHAT HOME SAYS UNDER EACH COUNT once the shop is open (docs/specs/2026-11-07-ux-today.md). Pure: it decides
// which line a tile carries; the page words it (dates through src/lib/format-date.ts). A count that could not
// be read is never a 0, and a risk that could not be read is never "0 high risk".
// =============================================================================

import { istLastDays } from '@/domains/time/day'

export type TileLine =
  | { kind: 'uncounted' }
  | { kind: 'none' }
  | { kind: 'high'; high: number; since: Date | null }
  | { kind: 'risk_unavailable'; since: Date | null }
  | { kind: 'oldest'; since: Date | null }

/** To confirm: the high-risk count when there is one, else the oldest wait. `high` null = the risk read failed. */
export function toConfirmLine(count: number | null, high: number | null, since: Date | null): TileLine {
  if (count === null) return { kind: 'uncounted' }
  if (count === 0) return { kind: 'none' }
  if (high === null) return { kind: 'risk_unavailable', since }
  return high > 0 ? { kind: 'high', high, since } : { kind: 'oldest', since }
}

/** To pack and On hold: the oldest wait. */
export function waitLine(count: number | null, since: Date | null): TileLine {
  if (count === null) return { kind: 'uncounted' }
  return count === 0 ? { kind: 'none' } : { kind: 'oldest', since }
}

export type DayBar = { day: string; orders: number; value: number; share: number; today: boolean }

/** The last 7 IST days, oldest first, zero-filled; each bar's height is its share of the busiest day's ORDER COUNT. */
export function weekBars(rows: { day: string; orders: number; value: number }[], now: Date): DayBar[] {
  const by = new Map(rows.map((r) => [r.day, r]))
  const days = istLastDays(now, 7)
  const top = Math.max(0, ...days.map((d) => by.get(d)?.orders ?? 0))
  return days.map((day, i) => {
    const r = by.get(day)
    const orders = r?.orders ?? 0
    return { day, orders, value: r?.value ?? 0, share: top ? orders / top : 0, today: i === days.length - 1 }
  })
}
