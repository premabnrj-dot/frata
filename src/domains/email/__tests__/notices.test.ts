import { describe, expect, it } from 'vitest'
import { noticeWords, REQUIRED_TYPES, DEFAULT_EMAIL } from '../notices'

describe('notice words', () => {
  it('words billing notices from their row', () => {
    expect(noticeWords({ kind: 'billing_notice', billingKind: 'debit_notice', amount: '₹6,240', debitAt: '3 Dec', invoiceNumber: 'FR/26-27/0041' }, 'Kesar Studio').title).toBe('₹6,240 will be debited on 3 Dec')
    expect(noticeWords({ kind: 'billing_notice', billingKind: 'failed', amount: '₹6,240', debitAt: null, invoiceNumber: null }, 'Kesar Studio').title).toMatch(/didn't go through/)
  })
  it('a support visit says why and for how long', () => {
    expect(noticeWords({ kind: 'support_session', reason: 'fix_problem', minutes: 30 }, 'S').body).toBe('Fix a problem · for 30 minutes. Every change they make is in Activity.')
  })
  it('required types and defaults', () => {
    expect(REQUIRED_TYPES).toEqual(['billing', 'security', 'frrata_action'])
    expect(DEFAULT_EMAIL.new_order).toBe(false)
  })
})
