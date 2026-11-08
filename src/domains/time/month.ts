// The start of the calendar month a moment falls in, as India counts it (IST,
// UTC+5:30, no daylight saving). "Orders this month" means this, everywhere.
import { IST_OFFSET_MS } from './day'


export function monthStartIST(now: Date): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS)
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - IST_OFFSET_MS)
}

/** The first moment of next month, IST — when a "from next month" plan change starts. */
export function nextMonthStartIST(now: Date): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS)
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() + 1, 1) - IST_OFFSET_MS)
}

/** The 1st of a "YYYY-MM" month, 00:00 IST; null when it is not one. */
export function monthOfYM(ym: string): Date | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(ym)
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1) - IST_OFFSET_MS) : null
}

/** "YYYY-MM" of the IST month `d` falls in. */
export function ymOf(d: Date): string {
  const ist = new Date(d.getTime() + IST_OFFSET_MS)
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}`
}
