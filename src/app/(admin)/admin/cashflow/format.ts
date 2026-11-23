import { formatInr } from '@/lib/format'
import { paise } from '@/domains/money/paise'

// How Admin › Cashflow shows money: rupees in Indian grouping, a minus as a real minus, an optional plus. Days and months come from
// ../costs/format (IST, three-letter months).
export { dayText, monthLongName, monthShortName } from '../costs/format'

/** "₹3,05,000", "−₹17,400", "+₹5,00,000" (with `plus`); paise show only when there are some. */
export function inrText(p: number, plus = false): string {
  const body = formatInr(paise(Math.abs(p)), { decimals: Math.abs(p) % 100 !== 0 })
  return p < 0 ? `−${body}` : plus && p > 0 ? `+${body}` : body
}

/** A form field's starting value from paise: "175000" or "-17400.5". */
export const inputRupees = (p: number) => String(p / 100)
