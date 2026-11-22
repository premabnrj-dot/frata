// =============================================================================
// FILE: src/domains/studio/session.ts — WHEN A STUDIO SESSION ENDS (plan docs/plans/2026-11-22-v3a-runtime.md
// § Session end; security H1, architecture 5). Ending deletes the session's build key and vault, its file reference,
// and archives the session at Anthropic; 30 days later the session is deleted there (our sweep: Anthropic keeps sessions
// until deleted, spike item 12). A session never outlives its 24-hour build key: it ends at 23 hours. Pure.
// =============================================================================

export const IDLE_END_MS = 60 * 60_000 // spec § 7: a pause over an hour starts a new session from the branch
export const MAX_AGE_MS = 23 * 60 * 60_000 // before the session's 24-hour build key ends
export const DELETE_AFTER_MS = 30 * 24 * 60 * 60_000 // ADR-0020 point 3

export type EndReason = 'stopped' | 'switch' | 'idle' | 'age' | 'actor' | 'start_failed' | 'restart'

export type SessionFacts = {
  now: Date
  createdAt: Date
  /** The last time anything happened: a Send, an event read that found something, a tool run. */
  lastActivityAt: Date
  /** A turn is open (sending or running). An open turn is never ended for idleness. */
  turnOpen: boolean
  /** STUDIO_OPEN is `staff`. */
  studioOpen: boolean
  /** `app_turn_actor` still answers for the session's person (null: not checked this time). */
  actorLive: boolean | null
}

/** Why this session must end now, or null. Order matters: the switch and a gone person win over age and idleness. */
export function endReason(s: SessionFacts): EndReason | null {
  if (!s.studioOpen) return 'switch'
  if (s.actorLive === false) return 'actor'
  if (s.now.getTime() - s.createdAt.getTime() >= MAX_AGE_MS) return 'age'
  if (!s.turnOpen && s.now.getTime() - s.lastActivityAt.getTime() >= IDLE_END_MS) return 'idle'
  return null
}

/** Whether an ended session is due for deletion at Anthropic. */
export const dueForDelete = (endedAt: Date, now: Date) => now.getTime() - endedAt.getTime() >= DELETE_AFTER_MS
