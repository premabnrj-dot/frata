// =============================================================================
// FILE: src/domains/checkout/offer-showcase.ts — what the shop shows of its offers before the bag: a card badge and the
// product page's offer lines (offers O·2; themes T2's `badge` and `offers` props). Raw rows come cached with the
// catalogue; whether an offer is live is decided here at render (offerStatus), never cached. Never a price: prices
// are the quote's. Pure.
// =============================================================================

import { offerStatus } from './offer-status'

/** One offer as the shop shows it: its words, whether it is a product offer, and its timestamps (ISO). */
export type ShowOffer = {
  label: string; badge: string | null; product: boolean
  startsAt: string; endsAt: string | null; startedAt: string | null; pausedAt: string | null; endedAt: string | null; stoppedAt: string | null
}

const d = (s: string | null) => (s ? new Date(s) : null)
const live = (o: ShowOffer, now: Date) => offerStatus({ startedAt: d(o.startedAt), pausedAt: d(o.pausedAt), endedAt: d(o.endedAt), stoppedAt: d(o.stoppedAt), startsAt: new Date(o.startsAt), endsAt: d(o.endsAt) }, now) === 'live'

/** The card's one offer tag: the first live product offer with a badge. */
export const cardBadge = (offers: readonly ShowOffer[] | undefined, now: Date): { label: string } | null => {
  const o = (offers ?? []).find((x) => x.product && x.badge && live(x, now))
  return o ? { label: o.badge! } : null
}

/** The product page's lines: this product's live offers first, then the shop's; a real end only ("till 30 Nov"). */
export const pdpLines = (offers: readonly ShowOffer[] | undefined, now: Date) =>
  [...(offers ?? [])].filter((o) => live(o, now)).sort((a, b) => Number(b.product) - Number(a.product)).slice(0, 4).map((o) => ({
    label: o.label,
    ends: o.endsAt ? `till ${new Date(o.endsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}` : null,
  }))
