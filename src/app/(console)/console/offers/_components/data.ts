import type { OfferRow } from '@/lib/queries/discounts'
import type { OfferStatus } from '@/domains/checkout/offer-status'
import { toIst, type OfferValues } from '@/domains/checkout/offer-form'
import { formatInr } from '@/lib/format'
import { paise } from '@/domains/money/paise'

/** How a status reads, everywhere (list, offer page). */
export const STATUS: Record<OfferStatus, { label: string; tone: 'ok' | 'warn' | 'info' | 'neutral' | 'danger' }> = {
  live: { label: 'Live', tone: 'ok' }, scheduled: { label: 'Scheduled', tone: 'info' }, draft: { label: 'Draft', tone: 'neutral' }, paused: { label: 'Paused', tone: 'warn' }, ended: { label: 'Ended', tone: 'neutral' },
}

const rs = (p: number) => (p % 100 === 0 ? String(p / 100) : (p / 100).toFixed(2))
/** What the offer gives, in a few words: "15% off above ₹2,999", "₹50 off paying online", "Free shipping". */
export function terms(o: Pick<OfferRow, 'style' | 'percentBps' | 'amountOff' | 'cap' | 'minSubtotal'>): string {
  const off = o.percentBps ? `${o.percentBps / 100}% off${o.cap ? ` (up to ${formatInr(paise(o.cap))})` : ''}` : o.amountOff ? `${formatInr(paise(o.amountOff))} off` : ''
  const above = o.minSubtotal ? ` above ${formatInr(paise(o.minSubtotal))}` : ''
  if (o.style === 'free_shipping') return `Free shipping${above}`
  if (o.style === 'pay_online') return `${off} paying online${above}`
  return `${off}${above}`
}

/** An offer's stored values as the form's strings. */
export function valuesOf(o: OfferRow): OfferValues {
  return {
    title: o.title, style: o.style, kind: o.percentBps ? 'percent' : 'amount', value: o.percentBps ? String(o.percentBps / 100) : o.amountOff ? rs(o.amountOff) : '',
    cap: o.cap ? rs(o.cap) : '', min: o.minSubtotal ? rs(o.minSubtotal) : '', code: o.code ?? '', startsAt: toIst(o.startsAt), endsAt: o.endsAt ? toIst(o.endsAt) : '',
    limitTotal: o.limitTotal ? String(o.limitTotal) : '', limitPerPhone: o.limitPerPhone ? String(o.limitPerPhone) : '', budget: o.budget ? rs(o.budget) : '',
    listed: o.listed, combinesWithPayment: o.combinesWithPayment, announce: o.announce,
  }
}
