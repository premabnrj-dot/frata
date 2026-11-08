// =============================================================================
// FILE: src/domains/billing/collect.ts — WHAT TO DO NEXT ABOUT A DUE FRRATA INVOICE (billing B3; plan finding 13).
// Pure. The daily run asks it for each issued invoice still due:
//   - a notice before EVERY debit, the debit ≥ 25 h after it (RBI e-mandate framework: ≥ 24 h; Cashfree's 25 h);
//   - the first attempt once the notice has stood; after a failure a fresh notice at once, so each retry comes ≥ 25 h
//     later (T+1..T+3), at most 3 after the first;
//   - never while another attempt is unsettled (a timeout stays unknown until the gateway or webhook settles it);
//   - never a test invoice with live keys, nor a real one with test keys;
//   - on day 14 still unpaid, one acknowledge-only notice (owner call: the shop never stops);
//   - never during a trial (trials A2, E2): the notice goes no earlier than 25 h before the trial ends, so the debit
//     lands after it; the day-14 clock counts from the later of the invoice and the trial's end.
// =============================================================================

const HOUR = 3_600_000, DAY = 24 * HOUR
export const NOTICE_LEAD_MS = 25 * HOUR
export const MAX_ATTEMPTS = 4
export const ACKNOWLEDGE_AFTER_DAYS = 14

export type DueInvoice = { due: number; testMode: boolean; issuedAt: Date; mandate: boolean; mandateMax: number | null; noticeAt: Date | null; attempts: number; pending: number; lastFailedAt: Date | null; acknowledged: boolean; trialEndsAt?: Date | null }
export type Step = { kind: 'notice'; debitAt: Date } | { kind: 'attempt'; attempt: number } | { kind: 'acknowledge' } | { kind: 'wait'; why: string }

export function nextStep(d: DueInvoice, now: Date, gatewayIsTest: boolean): Step {
  const t = now.getTime()
  const spent = !d.mandate || d.attempts >= MAX_ATTEMPTS
  const from = Math.max(d.issuedAt.getTime(), d.trialEndsAt?.getTime() ?? 0)
  if (spent && !d.acknowledged && t - from >= ACKNOWLEDGE_AFTER_DAYS * DAY) return { kind: 'acknowledge' }
  if (d.testMode !== gatewayIsTest) return { kind: 'wait', why: d.testMode ? 'a test invoice is never collected with live keys' : 'a real invoice is never collected with test keys' }
  if (!d.mandate) return { kind: 'wait', why: 'no autopay' }
  if (d.pending > 0) return { kind: 'wait', why: 'an attempt is not settled yet' }
  if (d.attempts >= MAX_ATTEMPTS) return { kind: 'wait', why: 'retries spent' }
  if (d.mandateMax !== null && d.due > d.mandateMax) return { kind: 'wait', why: 'above the autopay limit' }
  if (d.trialEndsAt && t + NOTICE_LEAD_MS < d.trialEndsAt.getTime()) return { kind: 'wait', why: 'in a trial: collected after it ends' }
  // A failed attempt needs a fresh notice before the next debit, and a day's rest.
  const needsNotice = !d.noticeAt || (d.lastFailedAt !== null && d.noticeAt.getTime() < d.lastFailedAt.getTime())
  // After a failure the next notice goes at once, so the retry lands ≥ 25 h later: a day apart (T+1), as the rules ask.
  if (needsNotice) return { kind: 'notice', debitAt: new Date(t + NOTICE_LEAD_MS) }
  if (t >= d.noticeAt!.getTime() + NOTICE_LEAD_MS) return { kind: 'attempt', attempt: d.attempts + 1 }
  return { kind: 'wait', why: 'the notice must stand 25 hours' }
}
