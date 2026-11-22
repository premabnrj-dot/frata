import { describe, expect, it } from 'vitest'
import { noticeFallback, noticeWords, REQUIRED_TYPES, DEFAULT_EMAIL } from '../notices'

describe('notice words', () => {
  it('words billing notices from their row', () => {
    expect(noticeWords({ kind: 'billing_notice', billingKind: 'debit_notice', amount: '₹6,240', debitAt: '3 Dec', invoiceNumber: 'FR/26-27/0041' }, 'Kesar Studio').title).toBe('₹6,240 will be debited on 3 Dec')
    expect(noticeWords({ kind: 'billing_notice', billingKind: 'failed', amount: '₹6,240', debitAt: null, invoiceNumber: null }, 'Kesar Studio').title).toMatch(/didn't go through/)
  })
  it('each billing kind has its own title', () => {
    const t = (billingKind: string) => noticeWords({ kind: 'billing_notice', billingKind, amount: '₹6,240', debitAt: null, invoiceNumber: 'FR/26-27/0041' }, 'S').title
    expect(new Set(['debit_notice', 'failed', 'acknowledge'].map(t)).size).toBe(3)
    expect(t('acknowledge')).toBe('₹6,240 is due on your Frrata bill')
  })
  it('a notice whose source is gone is still titled by what it is, never "Notice"', () => {
    expect(noticeFallback({ sourceKind: 'billing_notice', type: 'billing', title: null, body: null }).title).toBe('Your Frrata bill')
    expect(noticeFallback({ sourceKind: 'support_session', type: 'frrata_action', title: null, body: null }).title).toBe('Frrata support opened your store')
    expect(noticeFallback({ sourceKind: 'handover', type: 'security', title: null, body: null }).title).toBe('Security')
    expect(noticeFallback({ sourceKind: 'admin', type: 'product_update', title: 'New: Offers', body: 'b' })).toEqual({ title: 'New: Offers', body: 'b' })
  })
  it('a support visit says why and for how long', () => {
    expect(noticeWords({ kind: 'support_session', reason: 'fix_problem', minutes: 30 }, 'S').body).toBe('Fix a problem · for 30 minutes. Every change they make is in Activity.')
  })
  it('a partner asks the owner (PP1): the page in words, the way to it, nothing the partner typed', () => {
    const w = (page: 'policies' | 'business' | 'contact' | 'invoices') => noticeWords({ kind: 'ask_owner', page }, 'S')
    expect(w('contact')).toEqual({ title: 'Your partner asks you to update the grievance officer', body: 'See it in Settings.' })
    expect(w('policies')).toEqual({ title: 'Your partner asks you to update your policies', body: 'See it in Settings.' })
    expect(w('business')).toEqual({ title: 'Your partner asks you to update Business and GST', body: 'See it in Settings.' })
    expect(w('invoices')).toEqual({ title: 'Your partner asks you to update your invoice details', body: 'See it in Settings.' })
    expect(noticeFallback({ sourceKind: 'ask_owner', type: 'needs_you', title: null, body: null })).toEqual({ title: 'Your partner asks you to update a setting', body: 'See it in Settings.' })
  })
  it('a partner’s waiting brand change (one-address P1): its own line, kept with it', () => {
    expect(noticeWords({ kind: 'brand', summary: '4 logo files and 2 fonts.' }, 'S')).toEqual({ title: 'Your partner changed your brand', body: '4 logo files and 2 fonts.' })
    expect(noticeWords({ kind: 'brand', area: 'checkout', summary: 'The checkout heading.' }, 'S')).toEqual({ title: 'Your partner changed your checkout', body: 'The checkout heading.' })
    expect(noticeFallback({ sourceKind: 'brand', type: 'needs_you', title: null, body: null })).toEqual({ title: 'Your partner changed your brand', body: 'See it in Brand.' })
  })
  it('required types and defaults', () => {
    expect(REQUIRED_TYPES).toEqual(['billing', 'security', 'frrata_action'])
    expect(DEFAULT_EMAIL.new_order).toBe(false)
  })
})
