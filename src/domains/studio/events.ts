// =============================================================================
// FILE: src/domains/studio/events.ts — WHERE THE NEXT EVENT READ STARTS, AND WHICH MESSAGE IS A TURN'S (plan
// docs/plans/2026-11-22-v3a-runtime.md § Advance; security review of R5, MED-2). Managed Agents lists a session's
// events filtered by `created_at[gte]`; a queued message is listed before it is processed (no `processed_at`). So the
// cursor is a `created_at`, never empty, and it never passes an event the runtime has not processed yet (ids already
// stored are skipped on the re-read). A `user.message` is a turn's only once processed, created no earlier than the turn
// was sent (a minute's leeway for the two clocks), and held by no earlier turn. Pure.
// =============================================================================

export type EventStamp = { at: string; processed: boolean }

/** The cursor after a page: the earliest unprocessed event's time if any, else the latest time; the old one if none. */
export function cursorAfter(events: readonly EventStamp[], prev: string | null): string | null {
  const stamped = events.filter((e) => e.at !== '')
  const waiting = stamped.filter((e) => !e.processed).map((e) => e.at).sort()
  if (waiting.length) return waiting[0]!
  const latest = stamped.map((e) => e.at).sort().at(-1)
  return latest && (!prev || latest > prev) ? latest : prev
}

export const CLOCK_LEEWAY_MS = 60_000

/** Whether a `user.message` event opens this turn's window. */
export function opensTurn(ev: EventStamp & { id: string }, turn: { sentAt: Date; heldByAnotherTurn: boolean }): boolean {
  if (!ev.processed || ev.at === '' || turn.heldByAnotherTurn) return false
  const t = Date.parse(ev.at)
  return Number.isFinite(t) && t >= turn.sentAt.getTime() - CLOCK_LEEWAY_MS
}
