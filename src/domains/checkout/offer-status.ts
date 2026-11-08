// =============================================================================
// FILE: src/domains/checkout/offer-status.ts — an offer's status, derived from its timestamps (never stored).
// SQL twin: liveDiscountSql in src/lib/db/discount-predicates.ts. Pure.
// =============================================================================

export const OFFER_STATUSES = ['draft', 'scheduled', 'live', 'paused', 'ended'] as const
export type OfferStatus = (typeof OFFER_STATUSES)[number]

export type OfferMoments = { startedAt: Date | null; pausedAt: Date | null; endedAt: Date | null; startsAt: Date; endsAt: Date | null }

/** Ended (for good, or past its end) beats paused beats scheduled; a draft was never started. */
export function offerStatus(d: OfferMoments, now: Date): OfferStatus {
  if (d.endedAt || (d.endsAt && d.endsAt <= now)) return 'ended'
  if (!d.startedAt) return 'draft'
  if (d.pausedAt) return 'paused'
  return d.startsAt > now ? 'scheduled' : 'live'
}
