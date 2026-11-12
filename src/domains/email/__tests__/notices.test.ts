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
    expect(noticeFallback({ sourceKind: 'support_session', type: 'frrata_action', title: null, body: null }).title).toBe('Frrata support opened your shop')
    expect(noticeFallback({ sourceKind: 'handover', type: 'security', title: null, body: null }).title).toBe('Security')
    expect(noticeFallback({ sourceKind: 'admin', type: 'product_update', title: 'New: Offers', body: 'b' })).toEqual({ title: 'New: Offers', body: 'b' })
  })
  it('a support visit says why and for how long', () => {
    expect(noticeWords({ kind: 'support_session', reason: 'fix_problem', minutes: 30 }, 'S').body).toBe('Fix a problem · for 30 minutes. Every change they make is in Activity.')
  })
  it('required types and defaults', () => {
    expect(REQUIRED_TYPES).toEqual(['billing', 'security', 'frrata_action'])
    expect(DEFAULT_EMAIL.new_order).toBe(false)
  })
})
