// =============================================================================
// FILE: src/domains/reviews/state.ts — where a review is, derived from its timestamps (Reviews R1; no status column).
//
// Held reviews publish themselves 72 h after they were written unless the shop acts (IS 19000: a review is never
// sat on). A hidden review (the shop's reason, or one set at submit: a link or a phone number) never publishes by
// itself. The author's delete wins over everything. `now` is passed in (check:clock). The SQL twin is reviewLiveSql.
// =============================================================================

export const AUTO_PUBLISH_MS = 72 * 3_600_000

export type ReviewTimes = {
  createdAt: Date; heldAt: Date | null; approvedAt: Date | null; hiddenAt: Date | null; authorDeletedAt: Date | null
}
export type ReviewState = 'removed' | 'hidden' | 'held' | 'published'

export function reviewState(r: ReviewTimes, now: Date): ReviewState {
  if (r.authorDeletedAt) return 'removed'
  if (r.hiddenAt) return 'hidden'
  if (r.heldAt && !r.approvedAt && now.getTime() < r.createdAt.getTime() + AUTO_PUBLISH_MS) return 'held'
  return 'published'
}

/** When a held review goes live by itself (the queue's "publishes in …"), or null if it is not waiting. */
export function publishesAt(r: ReviewTimes, now: Date): Date | null {
  return reviewState(r, now) === 'held' ? new Date(r.createdAt.getTime() + AUTO_PUBLISH_MS) : null
}
