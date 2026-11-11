// =============================================================================
// FILE: src/domains/ekcode-core/flow.ts — WHERE ONE SIGN-IN HAS GOT TO, derived from its timestamps (no status column:
// CLAUDE.md "derive, never duplicate"). A flow row holds only started, number_in and account_created; the code rows
// and the grant say the rest (architecture review 4). Pure.
// =============================================================================

export type CodeFacts = {
  sentAt: Date | null
  deliveredAt: Date | null
  /** Meta's error code when the send or the delivery failed (131026 not on WhatsApp, 130429 throughput, …). */
  failedCode: number | null
  verifiedAt: Date | null
  expiresAt: Date
  tries: number
}

export type FlowFacts = {
  startedAt: Date
  numberInAt: Date | null
  accountCreatedAt: Date | null
  /** The newest code of the flow, if any. */
  code: CodeFacts | null
  /** When the grant back to the shop was made. */
  continuedAt: Date | null
}

export type FlowState =
  | 'started' | 'code_pending' | 'code_sent' | 'code_delivered' | 'code_failed' | 'code_expired' | 'locked'
  | 'verified' | 'account_created' | 'continued' | 'abandoned'

/** A flow not continued 15 minutes after it started is abandoned. */
export const ABANDON_AFTER_MS = 15 * 60_000
/** A code lives 10 minutes (Meta's TTL is the same: undelivered after that is dropped and not charged). */
export const CODE_TTL_MS = 10 * 60_000

export function flowState(f: FlowFacts, now: Date, triesPerCode = 5): FlowState {
  if (f.continuedAt) return 'continued'
  if (now.getTime() - f.startedAt.getTime() > ABANDON_AFTER_MS) return 'abandoned'
  if (f.accountCreatedAt) return 'account_created'
  const c = f.code
  if (!c) return 'started'
  if (c.verifiedAt) return 'verified'
  if (c.tries >= triesPerCode) return 'locked'
  if (now >= c.expiresAt) return 'code_expired'
  if (c.failedCode !== null) return 'code_failed'
  if (c.deliveredAt) return 'code_delivered'
  // The attempt row was committed before the call (ADR-0008); a send that timed out or answered 5xx has no sentAt:
  // its outcome is unknown, so the shopper is offered Resend, never told it failed.
  return c.sentAt ? 'code_sent' : 'code_pending'
}

/** When the island checks delivery after a send (speed review H3): three reads, never a tight poll. */
export const DELIVERY_CHECKS_MS = [5_000, 12_000, 20_000] as const
/** Resend is offered 30 s after the last send; "Didn't get it? Check out as a guest" after 20 s without delivery. */
export const RESEND_AFTER_MS = 30_000
export const GUEST_OFFER_AFTER_MS = 20_000

export type CodeScreen = { canResend: boolean; offerGuest: boolean; resendInMs: number }

/**
 * What the code screen offers now. A failure is never named to the shopper — "not on WhatsApp" would tell anyone
 * whether a number is on WhatsApp (security review M4; Meta terms §4.1) — it only brings the offers forward.
 */
export function codeScreen(c: CodeFacts, now: Date): CodeScreen {
  const since = c.sentAt ? now.getTime() - c.sentAt.getTime() : RESEND_AFTER_MS
  const failed = c.failedCode !== null || !c.sentAt
  const resendInMs = failed ? 0 : Math.max(0, RESEND_AFTER_MS - since)
  return {
    canResend: resendInMs === 0,
    offerGuest: failed || (!c.deliveredAt && since >= GUEST_OFFER_AFTER_MS),
    resendInMs,
  }
}

/** 130429 (Meta's throughput limit) is retried once after 2 s; anything else is not retried by us. */
export const retryOnce = (errorCode: number | null) => errorCode === 130429
