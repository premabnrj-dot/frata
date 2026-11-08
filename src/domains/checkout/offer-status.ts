// =============================================================================
// FILE: src/domains/checkout/offer-status.ts — an offer's status, derived from its timestamps (never stored).
// SQL twin: liveDiscountSql in src/lib/db/discount-predicates.ts. Pure.
// =============================================================================

export const OFFER_STATUSES = ['draft', 'scheduled', 'live', 'paused', 'stopped', 'ended'] as const
export type OfferStatus = (typeof OFFER_STATUSES)[number]

/** stoppedAt is required (O·4 review 3): every reader of an offer's status must say whether Frrata stopped it. */
export type OfferMoments = { startedAt: Date | null; pausedAt: Date | null; endedAt: Date | null; stoppedAt: Date | null; startsAt: Date; endsAt: Date | null }

/** Ended (for good, or past its end) beats stopped (by Frrata) beats draft beats paused beats scheduled. */
export function offerStatus(d: OfferMoments, now: Date): OfferStatus {
  if (d.endedAt || (d.endsAt && d.endsAt <= now)) return 'ended'
  if (d.stoppedAt) return 'stopped'
  if (!d.startedAt) return 'draft'
  if (d.pausedAt) return 'paused'
  return d.startsAt > now ? 'scheduled' : 'live'
}
