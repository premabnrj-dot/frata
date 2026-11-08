import { describe, expect, it } from 'vitest'
import { cardBadge, pdpLines, type ShowOffer } from '../offer-showcase'

const now = new Date('2026-11-20T10:00:00Z')
const o = (over: Partial<ShowOffer>): ShowOffer => ({ label: 'Offer', badge: null, product: false, startsAt: '2026-11-01T00:00:00Z', endsAt: null, startedAt: '2026-11-01T00:00:00Z', pausedAt: null, endedAt: null, ...over })

describe('the showcase decides live at render', () => {
  it('the card shows the first live product offer badge; paused, scheduled and shop-wide ones never', () => {
    expect(cardBadge([o({ product: true, badge: '20% off', pausedAt: '2026-11-10T00:00:00Z' }), o({ product: true, badge: 'Buy 2, get 1 free' })], now)).toEqual({ label: 'Buy 2, get 1 free' })
    expect(cardBadge([o({ product: true, badge: '20% off', startsAt: '2026-11-25T00:00:00Z' }), o({ badge: null })], now)).toBeNull()
  })
  it('the product page: product offers first, a real end only, at most four', () => {
    const lines = pdpLines([o({ label: 'Pay online, save ₹50' }), o({ label: 'Kurta sale: 20% off', product: true, endsAt: '2026-11-30T18:00:00Z' }), o({ label: 'Gone', endedAt: '2026-11-15T00:00:00Z' })], now)
    expect(lines).toEqual([{ label: 'Kurta sale: 20% off', ends: 'till 30 Nov' }, { label: 'Pay online, save ₹50', ends: null }])
  })
})
