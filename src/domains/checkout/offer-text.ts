// =============================================================================
// FILE: src/domains/checkout/offer-text.ts — how an offer reads, in one place: the console list, the form's preview
// and the shop's announcement bar all say it the same way (impact review). Pure.
// =============================================================================

import { formatInr } from '@/lib/format'
import { paise } from '@/domains/money/paise'
import type { DiscountStyle } from './discounts'

export type OfferWords = { title: string; style: DiscountStyle | string; percentBps: number | null; amountOff: number | null; cap?: number | null; minSubtotal: number }
const inr = (p: number) => formatInr(paise(p))

/** "10% off (up to ₹500)", "₹50 off", or '' for free shipping. */
export const offOf = (o: OfferWords, withCap = true) =>
  o.percentBps ? `${o.percentBps / 100}% off${withCap && o.cap ? ` (up to ${inr(o.cap)})` : ''}` : o.amountOff ? `${inr(o.amountOff)} off` : ''

/** What it gives, in a few words (console): "10% off above ₹2,000", "₹50 off paying online", "Free shipping above ₹999". */
export function offerTerms(o: OfferWords): string {
  const above = o.minSubtotal ? ` above ${inr(o.minSubtotal)}` : ''
  if (o.style === 'free_shipping') return `Free shipping${above}`
  if (o.style === 'pay_online') return `${offOf(o)} paying online${above}`
  return `${offOf(o)}${above}`
}

/** The shop's bar: "Festive · 10% off above ₹2,000 · code DIWALI15 · till 30 Nov". A code only when it is listed. */
export function barText(o: OfferWords, extra: { code: string | null; endsAt: Date | null }): string {
  const above = o.minSubtotal ? ` above ${inr(o.minSubtotal)}` : ''
  const what = o.style === 'pay_online' ? `Pay online, save ${o.amountOff ? inr(o.amountOff) : `${(o.percentBps ?? 0) / 100}%`}${above}`
    : o.style === 'free_shipping' ? `${o.title} · Free shipping${above}` : `${o.title} · ${offOf(o, false)}${above}`
  const till = extra.endsAt ? ` · till ${extra.endsAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}` : ''
  return `${what}${extra.code ? ` · code ${extra.code}` : ''}${till}`
}
