import { SUPPORT_REASON_LABEL, type SupportReason } from '@/domains/support/session'

// =============================================================================
// FILE: src/domains/email/notices.ts — WHAT A FRRATA NOTICE SAYS (spec § E·1; mockup v2 screen 8). Pure. A notice is
// worded when it is shown or emailed, from its source row (a billing notice, a support visit) or from Admin's own
// plain text — never stored twice. Money and dates arrive already formatted (src/lib/format*.ts on the server).
// =============================================================================

export const NOTICE_TYPES = ['billing', 'security', 'frrata_action', 'needs_you', 'product_update'] as const
export type NoticeType = (typeof NOTICE_TYPES)[number]
export const REQUIRED_TYPES: readonly NoticeType[] = ['billing', 'security', 'frrata_action']
/** The types a person may switch email off for (required ones are locked on the server too). */
export const OPTIONAL_TYPES = ['needs_you', 'product_update', 'new_order'] as const
export type OptionalType = (typeof OPTIONAL_TYPES)[number]
/** Absent preference → this (spec: new order off by default; owner call 6). */
export const DEFAULT_EMAIL: Record<OptionalType, boolean> = { needs_you: true, product_update: false, new_order: false }

export const TYPE_LABEL: Record<NoticeType, string> = {
  billing: 'Billing', security: 'Security', frrata_action: 'Frrata acted on your shop', needs_you: 'Needs you', product_update: 'Frrata update',
}

export type NoticeSource =
  | { kind: 'billing_notice'; billingKind: string; amount: string; debitAt: string | null; invoiceNumber: string | null }
  | { kind: 'support_session'; reason: string; minutes: number | null }
  | { kind: 'admin'; title: string; body: string | null }
  /** A3: 3 days before a trial the shop started ends (required: it is about money). */
  | { kind: 'addon_trial'; name: string; monthly: string; day: string }
  /** OE·2: an order's change still waiting 24 hours for the shopper's payment (its number as stored; money formatted). */
  | { kind: 'edit_payment'; number: string; amount: string }

export type NoticeWords = { title: string; body: string }

export function noticeWords(s: NoticeSource, shopName: string): NoticeWords {
  switch (s.kind) {
    case 'billing_notice':
      if (s.billingKind === 'debit_notice') return { title: `${s.amount} will be debited${s.debitAt ? ` on ${s.debitAt}` : ''}`, body: `${shopName}'s Frrata bill${s.invoiceNumber ? ` ${s.invoiceNumber}` : ''}. Nothing to do if this looks right.` }
      if (s.billingKind === 'failed') return { title: `Your payment of ${s.amount} didn't go through`, body: `We'll try again. Pay now from Plan and billing to keep ${shopName} running without a break.` }
      if (s.billingKind === 'acknowledge') return { title: `${s.amount} is due on your Frrata bill`, body: `${shopName}'s bill${s.invoiceNumber ? ` ${s.invoiceNumber}` : ''} is still unpaid. Pay it from Plan and billing.` }
      return { title: `Your Frrata bill: ${s.amount}`, body: `${shopName}'s bill${s.invoiceNumber ? ` ${s.invoiceNumber}` : ''} is ready in Plan and billing.` }
    case 'support_session': {
      const why = SUPPORT_REASON_LABEL[s.reason as SupportReason] ?? 'Support'
      return { title: 'Frrata support opened your shop', body: `${why}${s.minutes ? ` · for ${s.minutes} minutes` : ''}. Every change they make is in Activity.` }
    }
    case 'admin':
      return { title: s.title, body: s.body ?? '' }
    case 'addon_trial':
      return { title: `${s.name} starts at ${s.monthly}/month + GST on ${s.day}`, body: `End the trial before ${s.day} and nothing is charged.` }
    case 'edit_payment':
      return { title: `Order ${s.number} is waiting for ${s.amount}`, body: 'Send the payment link again, or ship without the change.' }
  }
}

/**
 * A notice whose source row is gone (or was never readable): still titled by what it is, never a bare "Notice" (full
 * e2e 2026-11-12: three Billing notices read "Notice"). Admin's own words win when it has them.
 */
export function noticeFallback(n: { sourceKind: string; type: string; title: string | null; body: string | null }): NoticeWords {
  if (n.title) return { title: n.title, body: n.body ?? '' }
  if (n.sourceKind === 'billing_notice') return { title: 'Your Frrata bill', body: 'See it in Plan and billing.' }
  if (n.sourceKind === 'addon_trial') return { title: 'Your app trial ends soon', body: 'See it in Apps.' }
  if (n.sourceKind === 'support_session') return { title: 'Frrata support opened your shop', body: 'Every change they made is in Activity.' }
  if (n.sourceKind === 'edit_payment') return { title: 'An order is waiting for the shopper\'s payment', body: 'See it in Orders.' }
  return { title: TYPE_LABEL[n.type as NoticeType] ?? 'Frrata update', body: n.body ?? '' }
}
