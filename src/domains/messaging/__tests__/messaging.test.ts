import { describe, expect, it } from 'vitest'
import { messageKey, sendAfter, ORDER_MESSAGES } from '../events'
import { stillTrue } from '../still'
import { fill, firstName, unknownPlaceholders } from '../placeholders'
import type { OrderMoments } from '@/domains/orders/order-state'

const t0 = new Date('2026-11-11T10:00:00Z')
const o = (p: Partial<OrderMoments> = {}): OrderMoments => ({ placedAt: t0, paymentMethod: 'cod', payBy: null, paidAt: null, switchedToCodAt: null, confirmedAt: null, heldAt: null,
  packedAt: null, cancelledAt: null, shippedAt: null, ndrAt: null, deliveredAt: null, lostAt: null, rtoInitiatedAt: null, rtoDeliveredAt: null, stockShort: false, ...p })

describe('events', () => {
  it('waits 5 minutes for shipped and delivered; finish paying waits for pay_by', () => {
    expect(sendAfter('shipped', t0).getTime() - t0.getTime()).toBe(300_000)
    expect(sendAfter('confirmed', t0).getTime()).toBe(t0.getTime())
    const payBy = new Date(t0.getTime() + 20 * 60_000)
    expect(sendAfter('finish_paying', t0, payBy).getTime()).toBe(payBy.getTime() + 60_000)
  })
  it('keys one message per kind per event', () => {
    expect(messageKey('email', 'shipped', 'e1')).toBe('email:shipped:e1')
    expect(new Set(ORDER_MESSAGES.map((k) => messageKey('email', k, 'e1'))).size).toBe(ORDER_MESSAGES.length)
  })
})

describe('still true at send time', () => {
  const later = new Date(t0.getTime() + 3600_000)
  it('an undone step sends nothing', () => expect(stillTrue('shipped', o({ shippedAt: t0 }), later, true)).toBe('undone'))
  it('shipped then delivered: shipped is superseded', () => expect(stillTrue('shipped', o({ shippedAt: t0, deliveredAt: t0 }), later, false)).toBe('superseded'))
  it('shipped then cancelled', () => expect(stillTrue('shipped', o({ shippedAt: t0, cancelledAt: t0 }), later, false)).toBe('cancelled'))
  it('finish paying only while abandoned', () => {
    const online = o({ paymentMethod: 'prepaid', payBy: t0 })
    expect(stillTrue('finish_paying', online, later, false)).toBe('ok')
    expect(stillTrue('finish_paying', { ...online, paidAt: t0 }, later, false)).toBe('paid')
    expect(stillTrue('finish_paying', { ...online, switchedToCodAt: t0 }, later, false)).toBe('not_due')
    expect(stillTrue('finish_paying', { ...online, payBy: new Date(later.getTime() + 60_000) }, later, false)).toBe('not_due')
  })
  it('confirmed: a standing order; an unpaid online one is not due', () => {
    expect(stillTrue('confirmed', o(), later, false)).toBe('ok')
    expect(stillTrue('confirmed', o({ paymentMethod: 'prepaid', payBy: t0 }), later, false)).toBe('not_due')
    expect(stillTrue('confirmed', o({ cancelledAt: t0 }), later, false)).toBe('cancelled')
  })
})

describe('placeholders', () => {
  it('fills and drops a line with a missing value', () => {
    expect(fill('Hi [First name]\nTracking: [Tracking number]', { 'First name': 'Asha' })).toBe('Hi Asha')
    expect(fill('[Nope] here', {})).toBe('')
    expect(unknownPlaceholders('Hi [First name] [Nope]')).toEqual(['Nope'])
  })
  it('first name only, capped', () => {
    expect(firstName('  Asha Rao ')).toBe('Asha')
    expect(firstName('x'.repeat(50))).toHaveLength(30)
  })
})
