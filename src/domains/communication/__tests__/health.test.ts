import { describe, expect, it } from 'vitest'
import { connectionState, limitWords, needsFor, qualityWords, type HealthFacts } from '../health'

const ok: HealthFacts = { displayPhone: '+91 98450 12345', verifiedName: 'Kesar Studio', coexistence: true, quality: 'GREEN', limitTier: 'TIER_250', nameStatus: 'APPROVED', paymentOk: true, currency: 'INR', canSend: 'AVAILABLE', tokenRejectedAt: null }
const nov = new Date('2026-11-07T10:00:00Z')

describe('needsFor', () => {
  it('a healthy number needs nothing', () => {
    expect(needsFor(ok, nov)).toEqual([]); expect(connectionState([])).toBe('connected')
  })
  it('worst first: access ended, then payment, then INR, then the name in review', () => {
    const n = needsFor({ ...ok, tokenRejectedAt: nov, paymentOk: false, currency: 'USD', nameStatus: 'PENDING_REVIEW' }, nov)
    expect(n.map((x) => x.key)).toEqual(['reconnect', 'payment', 'currency', 'name_review'])
    expect(n[2]!.badge).toBe('By 31 Dec')
    expect(n[3]!.text).toBe('Display name "Kesar Studio"')
    expect(connectionState(n)).toBe('attention')
  })
  it('non-INR billing blocks from 1 Jan 2027 (IST)', () => {
    expect(needsFor({ ...ok, currency: 'USD' }, new Date('2027-01-01T00:00:00+05:30'))[0]!.tone).toBe('danger')
    expect(needsFor({ ...ok, currency: 'USD' }, new Date('2026-12-31T23:59:00+05:30'))[0]!.tone).toBe('warn')
  })
  it('Meta blocking the number is the first thing after access', () => {
    expect(needsFor({ ...ok, canSend: 'BLOCKED', paymentOk: false }, nov).map((x) => x.key)).toEqual(['blocked', 'payment'])
    expect(needsFor({ ...ok, canSend: 'LIMITED' }, nov)[0]!.key).toBe('quality')
  })
  it('an unknown payment state is not a problem; low quality is', () => {
    expect(needsFor({ ...ok, paymentOk: null }, nov)).toEqual([])
    expect(needsFor({ ...ok, quality: 'RED' }, nov)[0]!.key).toBe('quality')
  })
})

describe('words', () => {
  it('Meta values never reach the page raw', () => {
    expect(limitWords('TIER_250')).toBe('250'); expect(limitWords('TIER_100K')).toBe('1,00,000'); expect(limitWords('odd')).toBeNull()
    expect(qualityWords('GREEN')).toBe('High'); expect(qualityWords(null)).toBe('Not rated yet')
  })
})
