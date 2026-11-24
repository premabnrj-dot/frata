// =============================================================================
// FILE: src/domains/studio/rate-state.ts — HOW FRESH THE DOLLAR RATE IS, FOR ADMIN'S BANNER (V3b K2; mockup
// docs/mockups/2026-11-24-v3b-first.html § 1, approved 2026-11-24, call 2). The reserve takes the newest rate whose day is
// within RATE_MAX_AGE_DAYS India days of today (app_pc_reserve: day >= today − 4), so a rate of day D prices turns
// through D + 4. Ageing from its third day: the banner names the last day it works, then "tomorrow" on that day.
// Pure: days are India day keys ("2026-11-24").
// =============================================================================

import { RATE_MAX_AGE_DAYS } from './credits'

export type RateState =
  | { kind: 'none' }
  | { kind: 'fresh' }
  | { kind: 'ageing'; lastDay: string }
  | { kind: 'last' }
  | { kind: 'lapsed'; newest: string }

const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
const plus = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/** The newest rate's day (null: none typed yet) against today, both India day keys. */
export function rateState(newest: string | null, today: string): RateState {
  if (!newest) return { kind: 'none' }
  const age = days(newest, today)
  if (age > RATE_MAX_AGE_DAYS) return { kind: 'lapsed', newest }
  if (age === RATE_MAX_AGE_DAYS) return { kind: 'last' }
  if (age >= RATE_MAX_AGE_DAYS - 1) return { kind: 'ageing', lastDay: plus(newest, RATE_MAX_AGE_DAYS) }
  return { kind: 'fresh' }
}
