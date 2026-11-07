import { describe, expect, it } from 'vitest'
import { currentMethod, isReal, needsAction, orderState, paidAfterSwitch } from '../order-state'

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

describe('paying online', () => {
  const now = t(10)
  it('waits, then is abandoned; paid is ready to pack; COD after a switch', () => {
    expect(orderState({ placedAt: t(10), paymentMethod: 'prepaid', payBy: t(11) }, now)).toBe('awaiting_payment')
    expect(orderState({ placedAt: t(9), paymentMethod: 'prepaid', payBy: t(9) }, now)).toBe('payment_abandoned')
    expect(orderState({ placedAt: t(9), paymentMethod: 'prepaid', payBy: t(9), paidAt: t(9) }, now)).toBe('paid')
    expect(orderState({ placedAt: t(9), paymentMethod: 'prepaid', payBy: t(9), switchedToCodAt: t(9) }, now)).toBe('unconfirmed')
    expect(isReal('payment_abandoned')).toBe(false)
  })
  it('paid beats a switch to COD, and says so', () => {
    const o = { placedAt: t(9), paymentMethod: 'prepaid', switchedToCodAt: t(9), paidAt: t(10) }
    expect(orderState(o, now)).toBe('paid')
    expect(currentMethod(o)).toBe('prepaid')
    expect(paidAfterSwitch(o)).toBe(true)
    expect(currentMethod({ paymentMethod: 'prepaid', switchedToCodAt: t(9) })).toBe('cod')
  })
})
