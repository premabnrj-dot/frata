// =============================================================================
// FILE: src/domains/counters/fiscal-year.ts
//
// INDIA'S FINANCIAL YEAR (1 April – 31 March), in IST, for invoice series:
// numbers never repeat within a year and a new series starts on 1 April. Pure.
// =============================================================================
import { IST_OFFSET_MS } from '../time/day'


/** '26-27' for any moment from 1 Apr 2026 00:00 IST to 31 Mar 2027 23:59:59 IST. */
export function fiscalYear(at: Date): string {
  const ist = new Date(at.getTime() + IST_OFFSET_MS)
  const y = ist.getUTCFullYear()
  const start = ist.getUTCMonth() >= 3 ? y : y - 1
  return `${String(start % 100).padStart(2, '0')}-${String((start + 1) % 100).padStart(2, '0')}`
}
