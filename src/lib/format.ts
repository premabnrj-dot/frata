/**
 * Number formatting. PURE — no JSX, so it is testable without a renderer; the
 * components in src/components/data/numeric.tsx only render what this returns.
 */
import type { Paise } from '@/domains/money/paise'
import type { MicroUsd } from '@/domains/money/usd'

/** Indian digit grouping: lakhs and crores, not thousands all the way up. */
export function formatInr(paise: Paise, opts?: { decimals?: boolean }): string {
  const rupees = paise / 100
  const sign = rupees < 0 ? '−' : ''
  return sign + '₹' + Math.abs(rupees).toLocaleString('en-IN', {
    minimumFractionDigits: opts?.decimals ? 2 : 0,
    maximumFractionDigits: opts?.decimals ? 2 : 0,
  })
}

/** "919845012345" → "+91 98450 12345", as people read an Indian mobile; anything else as stored. */
export function formatPhone(stored: string): string {
  return /^91\d{10}$/.test(stored) ? `+91 ${stored.slice(2, 7)} ${stored.slice(7)}` : stored
}

/** A share as a merchant reads it: "16.5%". */
/** A count as India groups it: 18,400 · 1,84,300. */
export const formatCount = (n: number): string => Math.round(n).toLocaleString('en-IN')

export function formatPercent(fraction: number, digits = 1): string {
  return `${(fraction * 100).toFixed(digits)}%`
}

/** A vendor's cost to Frrata (micro-dollars) as staff read it: "$18.60", "$1,204" from $100; a real minus. */
export function formatUsd(micro: MicroUsd): string {
  const d = micro / 1e6
  const sign = d < 0 ? '−' : ''
  const abs = Math.abs(d)
  return sign + '$' + abs.toLocaleString('en-US', { minimumFractionDigits: abs >= 100 ? 0 : 2, maximumFractionDigits: abs >= 100 ? 0 : 2 })
}
