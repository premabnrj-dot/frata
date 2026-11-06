/**
 * Number formatting. PURE — no JSX, so it is testable without a renderer; the
 * components in src/components/data/numeric.tsx only render what this returns.
 */
import type { Paise } from '@/domains/money/paise'

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
export function formatPercent(fraction: number, digits = 1): string {
  return `${(fraction * 100).toFixed(digits)}%`
}
