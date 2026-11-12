// =============================================================================
// FILE: src/domains/money/rupees.ts
//
// A PRICE AS A PERSON WRITES IT → INTEGER PAISE (ADR-0004). Read here: the product editor (price, M.R.P., cost),
// collection rules' prices, a part credit note's amount, and the import (plan 2026-11-12-product-import PI·0 · 3), so
// a cell reads the same in the grid and in a sheet. Not yet: the Look's controls, Settings' shipping costs and
// sections, Admin's custom plan price (each strips ₹ and commas itself).
//
// Forgiving about the dress, strict about the number:
// - "₹", "Rs", "Rs.", "INR" before or after it; "/-" after it; spaces around it.
// - Commas only where a grouping puts them: Indian ("1,00,000", "12,34,567") or international ("100,000"). "1,2,99"
//   is not a price: a misplaced comma is a typo, never guessed.
// - Up to 2 decimals ("1299.00", "1299.5"); "999.999" is not a price.
// - Up to ₹99,99,999 (7 digits of rupees).
// - Zero and negatives are not prices; a cost may be zero when the caller says so (`zero`).
// Anything else is null: an unreadable price is an error, never 0.
// =============================================================================

const CURRENCY = /^(?:₹|rs\.?|inr)\s*|\s*(?:₹|rs\.?|inr)$/gi
const PLAIN = /^\d{1,7}$/
const INDIAN = /^\d{1,2}(?:,\d{2})*,\d{3}$/
const INTERNATIONAL = /^\d{1,3}(?:,\d{3})+$/

/** "₹1,299", "Rs. 1299", "1,00,000", "1299.00", "1,299/-" → paise; null when it is not a price (or is zero, unless `zero`). */
export function parseRupees(text: string, opts: { zero?: boolean } = {}): number | null {
  const t = text.trim().replace(/\s*\/-$/, '').replace(CURRENCY, '').trim()
  const m = /^([\d,]+)(?:\.(\d{1,2}))?$/.exec(t)
  if (!m) return null
  const whole = m[1]!
  if (!PLAIN.test(whole) && !INDIAN.test(whole) && !INTERNATIONAL.test(whole)) return null
  const digits = whole.replace(/,/g, '')
  if (digits.replace(/^0+(?=\d)/, '').length > 7) return null
  const paise = Number(digits) * 100 + Number((m[2] ?? '').padEnd(2, '0'))
  return paise > 0 || (paise === 0 && opts.zero) ? paise : null
}

/** Why a price box was refused, in the merchant's words: a zero is a number, just not a price a shop sells at. */
export const priceRefusal = (text: string) => (parseRupees(text, { zero: true }) === 0 ? 'More than ₹0.' : 'A price in rupees.')

/** 249050 → "2490.50", 249000 → "2490": what a price box shows. */
export function rupeesText(paise: number | null): string {
  if (paise === null) return ''
  const r = Math.floor(paise / 100), p = paise % 100
  return p ? `${r}.${String(p).padStart(2, '0')}` : String(r)
}
