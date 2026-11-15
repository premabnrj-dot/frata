// =============================================================================
// FILE: src/domains/content/schedule.ts — WHERE A DATED ENTRY IS, from its columns (never a stored status): stopped
// (ended early by a person), ended, scheduled (starts later), live. Pure; `now` is always passed.
// =============================================================================

export type Dated = { startsAt: Date | null; endsAt: Date | null; stoppedAt: Date | null }
export type EntryState = 'scheduled' | 'live' | 'ended' | 'stopped'

export function entryState(r: Dated, now: Date): EntryState {
  if (r.stoppedAt && r.stoppedAt <= now) return 'stopped'
  if (r.endsAt && r.endsAt <= now) return 'ended'
  if (r.startsAt && r.startsAt > now) return 'scheduled'
  return 'live'
}

/** Why an entry's dates can't be saved (null: they can). */
export function datesProblem(startsAt: Date | null, endsAt: Date | null): string | null {
  if (startsAt && endsAt && endsAt <= startsAt) return 'End is before the start. Pick a later end.'
  return null
}
