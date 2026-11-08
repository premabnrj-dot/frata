// =============================================================================
// FILE: src/domains/checkout/offer-text.ts — how an offer reads, in one place: the console list, the form's preview
// and the shop's announcement bar all say it the same way (impact review). Pure.
// =============================================================================

import { formatInr } from '@/lib/format'
import { paise } from '@/domains/money/paise'
import type { DiscountStyle } from './discounts'

export type OfferWords = { title: string; style: DiscountStyle | string; percentBps: number | null; amountOff: number | null; cap?: number | null; minSubtotal: number
  targets?: string; buyQty?: number | null; getQty?: number | null; getBps?: number | null
  tiers?: readonly { min: number; percentBps: number | null; amountOff: number | null }[]; firstOrder?: boolean }
const inr = (p: number) => formatInr(paise(p))

/** "10% off (up to ₹500)", "₹50 off", or '' for free shipping. */
export const offOf = (o: OfferWords, withCap = true) =>
  o.percentBps ? `${o.percentBps / 100}% off${withCap && o.cap ? ` (up to ${inr(o.cap)})` : ''}` : o.amountOff ? `${inr(o.amountOff)} off` : ''

/** "Buy 2, get 1 free" / "Buy 3, get 1 at 50% off". */
export const bxgyText = (o: OfferWords) => `Buy ${o.buyQty ?? 0}, get ${o.getQty ?? 0} ${!o.getBps || o.getBps >= 10_000 ? 'free' : `at ${o.getBps / 100}% off`}`
/** "10% off above ₹1,999 · 15% off above ₹2,999". */
const tiersText = (o: OfferWords) => (o.tiers ?? []).map((t) => `${t.percentBps ? `${t.percentBps / 100}% off` : `${inr(t.amountOff ?? 0)} off`} above ${inr(t.min)}`).join(' · ')

/** What it gives, in a few words (console, bar, form): one wording everywhere. */
export function offerTerms(o: OfferWords): string {
  const above = o.minSubtotal ? ` above ${inr(o.minSubtotal)}` : ''
  const first = o.firstOrder ? ' · first order' : ''
  const which = o.targets && o.targets !== 'all' ? ' on chosen products' : ''
  if (o.style === 'free_shipping') return `Free shipping${above}`
  if (o.style === 'pay_online') return `${offOf(o)} paying online${above}`
  if (o.style === 'bxgy') return `${bxgyText(o)}${which}`
  if (o.style === 'free_gift') return `Free gift${above}`
  if (o.style === 'product_off') return `${offOf(o)}${which}${above}`
  if (o.tiers?.length) return `${tiersText(o)}${first}`
  return `${offOf(o)}${above}${first}`
}

/** The shop's bar: "Festive · 10% off above ₹2,000 · code DIWALI15 · till 30 Nov". A code only when it is listed. */
export function barText(o: OfferWords, extra: { code: string | null; endsAt: Date | null }): string {
  const above = o.minSubtotal ? ` above ${inr(o.minSubtotal)}` : ''
  const what = o.style === 'pay_online' ? `Pay online, save ${o.amountOff ? inr(o.amountOff) : `${(o.percentBps ?? 0) / 100}%`}${above}`
    : o.style === 'free_shipping' ? `${o.title} · Free shipping${above}`
    : o.style === 'order_off' && !o.tiers?.length && !o.firstOrder ? `${o.title} · ${offOf(o, false)}${above}`
    : `${o.title} · ${offerTerms({ ...o, cap: null })}`
  const till = extra.endsAt ? ` · till ${extra.endsAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}` : ''
  return `${what}${extra.code ? ` · code ${extra.code}` : ''}${till}`
}
