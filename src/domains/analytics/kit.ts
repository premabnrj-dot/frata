// =============================================================================
// FILE: src/domains/analytics/kit.ts — WHAT THE CHARTS SAY, AS RULES (Neel N1b; kit mockup § Analytics kit).
//
// Every figure answers "is this good?": its change against the window before, in words, coloured by MEANING, not
// direction (returns going up is bad). The rest: three nice axis values, shade levels for a heat or a tile map, the
// busiest hours in words, where each state's tile sits, what a paid-online share did. Pure (check:layers); the
// components in src/components/charts/ draw what these return.
// =============================================================================

import { STATES, type State } from '@/domains/checkout/states'

export type Tone = 'good' | 'bad' | 'flat' | 'none'
export type Change = { arrow: '↑' | '↓' | ''; words: string; tone: Tone }

/**
 * The change from `before` to `now`. A count or money changes by percent; a share (0–1) by percentage points.
 * `good` says which way is good. No base (nothing before) is "—", never an infinite percent.
 */
export function change(now: number, before: number, o: { kind: 'count' | 'money' | 'share'; good: 'up' | 'down' }): Change {
  if (o.kind === 'share') {
    const pts = Math.round((now - before) * 1000) / 10
    if (pts === 0) return { arrow: '', words: 'No change', tone: 'flat' }
    const up = pts > 0
    const better = up === (o.good === 'up')
    return { arrow: up ? '↑' : '↓', words: `${up ? '↑' : '↓'} ${Math.abs(pts).toFixed(1)} point${Math.abs(pts) === 1 ? '' : 's'}${better ? '' : ' — worse'}`, tone: better ? 'good' : 'bad' }
  }
  if (before <= 0) return { arrow: '', words: '—', tone: 'none' }
  const pct = Math.round(((now - before) / before) * 100)
  if (pct === 0) return { arrow: '', words: 'No change', tone: 'flat' }
  const up = pct > 0
  const better = up === (o.good === 'up')
  return { arrow: up ? '↑' : '↓', words: `${up ? '↑' : '↓'} ${Math.abs(pct)}%`, tone: better ? 'good' : 'bad' }
}

/** Three evenly spaced axis values that read well (₹30k, ₹60k, ₹90k), the top at or above `max`. */
export function ticks(max: number): [number, number, number] {
  if (max <= 0) return [1, 2, 3]
  const raw = max / 3
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * mag).find((s) => s * 3 >= max) ?? 10 * mag
  return [step, step * 2, step * 3]
}

/** A shade level 0..n-1 for each value, linear from 0 to the largest (0 stays 0: nothing is the lightest). */
export function levels(values: readonly number[], n = 6): number[] {
  const top = Math.max(0, ...values)
  return values.map((v) => (top <= 0 || v <= 0 ? 0 : Math.min(n - 1, Math.max(1, Math.ceil((v / top) * (n - 1))))))
}

/** Heat buckets of an IST day: 6–9, 9–12, 12–3, 3–6, 6–9 pm, 9–12 pm, and midnight to 6. */
export const HOUR_BUCKETS = ['6a', '9a', '12p', '3p', '6p', '9p', '12a'] as const
const BUCKET_WORDS = ['6–9 am', '9 am–12 pm', '12–3 pm', '3–6 pm', '6–9 pm', '9–11 pm', 'midnight–6 am'] as const
/** Monday first, as India's calendars are. */
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const DAY_WORDS = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'] as const

/** The bucket of an IST hour (0–23). */
export const bucketOf = (hour: number) => (hour < 6 ? 6 : Math.min(5, Math.floor((hour - 6) / 3)))

/** "Sundays, 9–11 pm": the busiest cell of a day × bucket grid (7 × 7), or null when there is none. */
export function busiest(grid: readonly (readonly number[])[]): string | null {
  let best = 0, at: [number, number] | null = null
  grid.forEach((row, d) => row.forEach((n, b) => { if (n > best) { best = n; at = [d, b] } }))
  if (!at) return null
  const [d, b] = at as [number, number]
  return `${DAY_WORDS[d]}, ${BUCKET_WORDS[b]}`
}

/** "Paid online went from 34% to 47% of orders" (first week to last), or null with under two weeks of orders. */
export function splitWords(weeks: readonly { a: number; b: number }[], aWord = 'Paid online'): string | null {
  const real = weeks.filter((w) => w.a + w.b > 0)
  if (real.length < 2) return null
  const share = (w: { a: number; b: number }) => Math.round((w.a / (w.a + w.b)) * 100)
  const [f, l] = [share(real[0]!), share(real.at(-1)!)]
  return f === l ? `${aWord} stayed at ${l}% of orders.` : `${aWord} went from ${f}% to ${l}% of orders.`
}

/**
 * Where each state's tile sits on the grid (row, column; 1-based), drawn like India's shape without a map: every state
 * the same size, readable on a phone (kit mockup § By state). Union territories with few orders share a nearby row end.
 */
export const STATE_TILES: Record<State, { code: string; row: number; col: number }> = {
  'Jammu and Kashmir': { code: 'JK', row: 1, col: 3 }, Ladakh: { code: 'LA', row: 1, col: 4 },
  'Himachal Pradesh': { code: 'HP', row: 2, col: 3 }, Punjab: { code: 'PB', row: 2, col: 2 }, Uttarakhand: { code: 'UK', row: 2, col: 4 },
  Chandigarh: { code: 'CH', row: 2, col: 1 },
  Haryana: { code: 'HR', row: 3, col: 3 }, Delhi: { code: 'DL', row: 3, col: 4 }, Rajasthan: { code: 'RJ', row: 3, col: 2 },
  'Uttar Pradesh': { code: 'UP', row: 3, col: 5 }, Bihar: { code: 'BR', row: 3, col: 6 }, Sikkim: { code: 'SK', row: 2, col: 7 },
  'Arunachal Pradesh': { code: 'AR', row: 2, col: 8 },
  Gujarat: { code: 'GJ', row: 4, col: 1 }, 'Madhya Pradesh': { code: 'MP', row: 4, col: 3 }, Chhattisgarh: { code: 'CG', row: 4, col: 4 },
  Jharkhand: { code: 'JH', row: 4, col: 5 }, 'West Bengal': { code: 'WB', row: 4, col: 6 }, Assam: { code: 'AS', row: 3, col: 8 },
  Meghalaya: { code: 'ML', row: 3, col: 7 }, Nagaland: { code: 'NL', row: 4, col: 8 },
  'Dadra and Nagar Haveli and Daman and Diu': { code: 'DH', row: 5, col: 1 }, Maharashtra: { code: 'MH', row: 5, col: 2 },
  Telangana: { code: 'TG', row: 5, col: 3 }, Odisha: { code: 'OD', row: 5, col: 5 }, Tripura: { code: 'TR', row: 4, col: 7 },
  Manipur: { code: 'MN', row: 5, col: 8 }, Mizoram: { code: 'MZ', row: 5, col: 7 },
  Goa: { code: 'GA', row: 6, col: 1 }, Karnataka: { code: 'KA', row: 6, col: 2 }, 'Andhra Pradesh': { code: 'AP', row: 6, col: 3 },
  'Andaman and Nicobar Islands': { code: 'AN', row: 7, col: 6 },
  Lakshadweep: { code: 'LD', row: 7, col: 1 }, Kerala: { code: 'KL', row: 7, col: 2 }, 'Tamil Nadu': { code: 'TN', row: 7, col: 3 },
  Puducherry: { code: 'PY', row: 7, col: 4 },
}
export const TILE_ROWS = 7
export const TILE_COLS = 8

/** Every state on the list once (a test holds STATE_TILES to it: no state without a tile, no two on one cell). */
export const ALL_STATES: readonly State[] = STATES
