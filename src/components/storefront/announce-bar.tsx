import { offerStatus } from '@/domains/checkout/offer-status'
import { formatInr } from '@/lib/format'
import { paise } from '@/domains/money/paise'
import type { shopAnnouncement } from '@/lib/queries/storefront'

// =============================================================================
// THE ANNOUNCEMENT BAR (offers spec § Showcase): the one offer the merchant put in the bar, while it is live. An end
// date only when the offer has a real one; never a countdown (dark-pattern rule, spec § Rules). Server-rendered from
// the cached raw row; whether it is live is decided here, at render. Prices are the quote's, never this bar's.
// =============================================================================

type Announced = NonNullable<Awaited<ReturnType<typeof shopAnnouncement>>>

export function announceText(a: Announced): string {
  const off = a.percentBps ? `${a.percentBps / 100}% off` : a.amountOff ? `${formatInr(paise(a.amountOff))} off` : 'Free shipping'
  const above = a.minSubtotal ? ` above ${formatInr(paise(a.minSubtotal))}` : ''
  const what = a.style === 'pay_online' ? `Pay online, save ${a.amountOff ? formatInr(paise(a.amountOff)) : `${(a.percentBps ?? 0) / 100}%`}${above}` : `${a.title} · ${off}${above}`
  const till = a.endsAt ? ` · till ${new Date(a.endsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}` : ''
  return `${what}${a.code ? ` · code ${a.code}` : ''}${till}`
}

export function AnnounceBar({ a, now = new Date() }: { a: Announced | null; now?: Date }) {
  if (!a) return null
  const d = (s: string | null) => (s ? new Date(s) : null)
  if (offerStatus({ startedAt: d(a.startedAt), pausedAt: d(a.pausedAt), endedAt: d(a.endedAt), startsAt: new Date(a.startsAt), endsAt: d(a.endsAt) }, now) !== 'live') return null
  return <p data-announce className="bg-store-ink px-4 py-2 text-center text-xs text-store-paper">{announceText(a)}</p>
}
