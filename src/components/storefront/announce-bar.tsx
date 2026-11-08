import { offerStatus } from '@/domains/checkout/offer-status'
import { barText } from '@/domains/checkout/offer-text'
import type { shopAnnouncement } from '@/lib/queries/storefront'

// =============================================================================
// THE ANNOUNCEMENT BAR (offers spec § Showcase): the one offer the merchant put in the bar, while it is live. An end
// date only when the offer has a real one; never a countdown (dark-pattern rule, spec § Rules). Server-rendered from
// the cached raw row when the page renders; shop pages regenerate every 60 s, so a start or end shows up to a minute
// late (accepted; impact review). Prices are the quote's, never this bar's.
// =============================================================================

type Announced = NonNullable<Awaited<ReturnType<typeof shopAnnouncement>>>

export function AnnounceBar({ a, now }: { a: Announced | null; now: Date }) {
  if (!a) return null
  const d = (s: string | null) => (s ? new Date(s) : null)
  if (offerStatus({ startedAt: d(a.startedAt), pausedAt: d(a.pausedAt), endedAt: d(a.endedAt), startsAt: new Date(a.startsAt), endsAt: d(a.endsAt) }, now) !== 'live') return null
  return <p data-announce className="bg-store-ink px-4 py-2 text-center text-xs text-store-paper">{barText(a, { code: a.code, endsAt: d(a.endsAt) })}</p>
}
