import type { OfferRow } from '@/lib/queries/discounts'
import type { OfferStatus } from '@/domains/checkout/offer-status'
import { toIst, type OfferValues } from '@/domains/checkout/offer-form'
import { offerTerms } from '@/domains/checkout/offer-text'

/** How a status reads, everywhere (list, offer page). */
export const STATUS: Record<OfferStatus, { label: string; tone: 'ok' | 'warn' | 'info' | 'neutral' | 'danger' }> = {
  live: { label: 'Live', tone: 'ok' }, scheduled: { label: 'Scheduled', tone: 'info' }, draft: { label: 'Draft', tone: 'neutral' }, paused: { label: 'Paused', tone: 'warn' }, ended: { label: 'Ended', tone: 'neutral' },
}

const rs = (p: number) => (p % 100 === 0 ? String(p / 100) : (p / 100).toFixed(2))
/** What the offer gives, in a few words: one wording everywhere (offer-text.ts). */
export const terms = offerTerms

/** An offer's stored values as the form's strings. */
export function valuesOf(o: OfferRow): OfferValues {
  return {
    title: o.title, style: o.style, kind: o.percentBps ? 'percent' : 'amount', value: o.percentBps ? String(o.percentBps / 100) : o.amountOff ? rs(o.amountOff) : '',
    cap: o.cap ? rs(o.cap) : '', min: o.minSubtotal ? rs(o.minSubtotal) : '', code: o.code ?? '', startsAt: toIst(o.startsAt), endsAt: o.endsAt ? toIst(o.endsAt) : '',
    limitTotal: o.limitTotal ? String(o.limitTotal) : '', limitPerPhone: o.limitPerPhone ? String(o.limitPerPhone) : '', budget: o.budget ? rs(o.budget) : '',
    listed: o.listed, combinesWithPayment: o.combinesWithPayment, announce: o.announce,
  }
}
