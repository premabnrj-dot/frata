// =============================================================================
// FILE: src/domains/delivery/dates.ts — when an order arrives (Delivery Zones, plan docs/plans/2026-11-12-delivery-zones.md).
// The FLOOR (no app): exactly today's arrivalRange — calendar days: dispatch + the zone's (metro … rest) days. With the
// app: dispatch counts WORKING days (the shop's ship days, minus its holidays), an order after the daily cutoff (IST)
// starts from the next one, then the zone's delivery days as calendar days. The promise shown is the LATEST day of the
// range (owner call 3). No countdown anywhere. Pure; IST days as "YYYY-MM-DD" keys.
// =============================================================================

import { istDayKey } from '@/domains/time/day'

const DAY = 86_400_000

export const addDays = (iso: string, n: number) => istDayKey(new Date(new Date(`${iso}T00:00:00+05:30`).getTime() + n * DAY))

/** The weekday of an IST day key: 0 Mon … 6 Sun. */
const weekday = (iso: string) => (new Date(`${iso}T12:00:00+05:30`).getUTCDay() + 6) % 7

/** The app's dispatch: working days to dispatch, the daily cutoff ("14:00", IST) or null, ship days as a Mon..Sun
 *  bitmask (bit 0 = Monday; default Mon–Sat = 0b0111111), and the shop's holidays (IST day keys). */
export type Dispatch = { days: number; cutoff: string | null; shipDays: number; holidays: readonly string[] }

export const MON_TO_SAT = 0b0111111

const ships = (iso: string, d: Dispatch) => ((d.shipDays >> weekday(iso)) & 1) === 1 && !d.holidays.includes(iso)

/** The day an order placed at `now` (or a line ready on `readyOn`) leaves, on the app's dispatch rules. */
export function dispatchDay(readyOn: string, d: Dispatch, now: Date): string {
  if (!d.shipDays) return addDays(readyOn, d.days) // no ship day set: never loop
  const today = istDayKey(now)
  let day = readyOn
  // Placed today after the cutoff: today no longer counts.
  if (day === today && d.cutoff) {
    const hhmm = new Date(now.getTime() + 330 * 60_000).toISOString().slice(11, 16)
    if (hhmm >= d.cutoff) day = addDays(day, 1)
  }
  // The first ship day on or after `day` is dispatch day 0; each further working day counts one.
  let guard = 0
  while (!ships(day, d) && guard++ < 60) day = addDays(day, 1)
  for (let left = d.days; left > 0 && guard < 120; guard++) {
    day = addDays(day, 1)
    if (ships(day, d)) left--
  }
  return day
}

export type Line = { kind: 'in_stock' | 'made_to_order' | 'preorder'; shipsBy: string | null; leadMinDays: number | null; leadMaxDays: number | null }

/** When a bag arrives: the latest line decides. Floor (dispatch = null): calendar days, as before. */
export function arrival(lines: readonly Line[], days: readonly [number, number], dispatch: { calendarDays: number } | Dispatch, now: Date): { from: string; to: string } | null {
  if (!lines.length) return null
  const today = istDayKey(now)
  let from = today, to = today
  for (const l of lines) {
    const start = l.kind === 'preorder' && l.shipsBy ? l.shipsBy : today
    const makeMin = l.kind === 'made_to_order' ? l.leadMinDays ?? 0 : 0, makeMax = l.kind === 'made_to_order' ? l.leadMaxDays ?? makeMin : 0
    let f: string, t: string
    if ('calendarDays' in dispatch) {
      f = addDays(start, makeMin + dispatch.calendarDays + days[0]); t = addDays(start, makeMax + dispatch.calendarDays + days[1])
    } else {
      f = addDays(dispatchDay(addDays(start, makeMin), dispatch, now), days[0]); t = addDays(dispatchDay(addDays(start, makeMax), dispatch, now), days[1])
    }
    if (f > from) from = f
    if (t > to) to = t
  }
  return { from, to }
}
