// A calendar day as India counts it (IST, UTC+5:30, no daylight saving): "today", "last 7 days" and a day's
// bar on Home (U·4) mean this, in SQL and in code alike. The month version is month.ts.

const IST_OFFSET_MS = 330 * 60_000
const DAY_MS = 86_400_000

/** "2026-11-07": the IST date a moment falls on (the key SQL groups by: `(t at time zone 'Asia/Kolkata')::date`). */
export function istDayKey(at: Date): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)
}

/** The first moment of the IST day `offset` days from the one `now` falls on (0 today, -6 six days ago). */
export function istDayStart(now: Date, offset = 0): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS)
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + offset) - IST_OFFSET_MS)
}

/** The keys of the `n` IST days ending today, oldest first. */
export function istLastDays(now: Date, n: number): string[] {
  return Array.from({ length: n }, (_, i) => istDayKey(new Date(istDayStart(now, i - (n - 1)).getTime() + DAY_MS / 2)))
}
