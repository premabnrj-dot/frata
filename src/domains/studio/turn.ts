// =============================================================================
// FILE: src/domains/studio/turn.ts — A TURN'S AND A SESSION'S STATE, FROM TIMESTAMPS (plan
// docs/plans/2026-11-22-v3a-runtime.md R1, § Advance, § Session end). There is no status column: a turn is what its
// times say. One open turn a session (a unique partial index on `studio_turns`). A tool call is accepted only inside
// the open turn's window: after that turn's `user.message` event and before the turn closes (ADR-0020 § 4), so a call
// left from an earlier turn never runs as the next turn's person. Pure.
// =============================================================================

export type TurnTimes = { sentAt: Date; startedAt: Date | null; endedAt: Date | null; pausedAt: Date | null; failedAt: Date | null }
/** sending: our row is committed, the runtime has not taken the message yet; running: it has; the rest are closed. */
export type TurnState = 'sending' | 'running' | 'done' | 'paused' | 'failed'

export function turnState(t: TurnTimes): TurnState {
  if (t.failedAt) return 'failed'
  if (t.pausedAt) return 'paused'
  if (t.endedAt) return 'done'
  return t.startedAt ? 'running' : 'sending'
}
export const turnOpen = (t: TurnTimes) => !t.endedAt && !t.pausedAt && !t.failedAt

/**
 * Whether a custom tool call may run for this turn. `afterUserMessage`: the call's event came after the turn's own
 * `user.message` event in the session's event order (the runtime lists events in order; the caller compares positions).
 */
export function callAccepted(t: TurnTimes, afterUserMessage: boolean): boolean {
  return turnOpen(t) && t.startedAt !== null && afterUserMessage
}

/** Why a turn failed: our codes only, never a vendor's words (they can quote content). */
export const FAIL_REASONS = ['start', 'send', 'budget', 'runtime', 'actor', 'switch', 'expired', 'workspace'] as const
export type FailReason = (typeof FAIL_REASONS)[number]
