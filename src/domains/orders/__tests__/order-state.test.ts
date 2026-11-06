import { describe, expect, it } from 'vitest'
import { needsAction, orderState } from '../order-state'

const t = (n: number) => new Date(2026, 10, n)

describe('orderState', () => {
  it('starts unconfirmed', () => {
    expect(orderState({ placedAt: t(1) })).toBe('unconfirmed')
  })
  it('reads the furthest moment reached, whatever order the webhooks came in', () => {
    expect(orderState({ placedAt: t(1), deliveredAt: t(5), shippedAt: t(2) })).toBe('delivered')
  })
  it('an RTO outranks a delivery attempt', () => {
    expect(orderState({ placedAt: t(1), shippedAt: t(2), ndrAt: t(4), rtoInitiatedAt: t(6) })).toBe('rto')
  })
  it('queues only what a merchant must act on', () => {
    expect(needsAction('ndr')).toBe(true)
    expect(needsAction('delivered')).toBe(false)
  })
})
