import type { OfferRow } from '@/lib/queries/discounts'
import { STATUS_WORDS } from '@/domains/checkout/offer-status'
import { toIst, type OfferValues } from '@/domains/checkout/offer-form'
import { offerTerms } from '@/domains/checkout/offer-text'

/** How a status reads, everywhere (offer-status.ts). */
export const STATUS = STATUS_WORDS

const rs = (p: number) => (p % 100 === 0 ? String(p / 100) : (p / 100).toFixed(2))
/** What the offer gives, in a few words: one wording everywhere (offer-text.ts). */
export const terms = offerTerms

/** An offer's stored values as the form's strings. */
export function valuesOf(o: OfferRow): OfferValues {
  return {
    title: o.title, style: o.style, kind: o.percentBps || o.tiers[0]?.percentBps ? 'percent' : 'amount', value: o.percentBps ? String(o.percentBps / 100) : o.amountOff ? rs(o.amountOff) : '',
    cap: o.cap ? rs(o.cap) : '', min: o.minSubtotal ? rs(o.minSubtotal) : '', code: o.code ?? '', startsAt: toIst(o.startsAt), endsAt: o.endsAt ? toIst(o.endsAt) : '',
    limitTotal: o.limitTotal ? String(o.limitTotal) : '', limitPerPhone: o.limitPerPhone ? String(o.limitPerPhone) : '', budget: o.budget ? rs(o.budget) : '',
    listed: o.listed, combinesWithPayment: o.combinesWithPayment, announce: o.announce,
    targets: o.targets, targetIds: o.targetIds, buyQty: o.buyQty ? String(o.buyQty) : '2', getQty: o.getQty ? String(o.getQty) : '1', getPct: o.getBps ? String(o.getBps / 100) : '100',
    giftVariantId: o.giftVariantId ?? '', firstOrder: o.firstOrder,
    tiers: o.tiers.map((t) => ({ min: rs(t.min), value: t.percentBps ? String(t.percentBps / 100) : rs(t.amountOff ?? 0) })),
  }
}
