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
