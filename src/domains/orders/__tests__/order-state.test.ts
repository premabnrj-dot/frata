import { describe, expect, it } from 'vitest'
import { cashAtDoor, currentMethod, enteredAt, isHolding, isPlaced, isStanding, needsAction, offerWay, ORDER_STATES, orderState, paidAfterPacking, paidAfterSwitch, queueTab, shopperState, SHOPPER_STATES, usesDiscount, type OrderMoments } from '../order-state'

const t = (n: number) => new Date(2026, 10, n)
/** A COD order placed on day 1, nothing else happened yet; override what did. */
export const moments = (o: Partial<OrderMoments> = {}): OrderMoments => ({
  placedAt: t(1), paymentMethod: 'cod', payBy: null, paidAt: null, switchedToCodAt: null, confirmedAt: null, heldAt: null, packedAt: null,
  cancelledAt: null, shippedAt: null, ndrAt: null, deliveredAt: null, lostAt: null, rtoInitiatedAt: null, rtoDeliveredAt: null, stockShort: false, ...o,
})

describe('orderState', () => {
  it('starts unconfirmed', () => {
    expect(orderState(moments(), new Date())).toBe('unconfirmed')
  })
  it('reads the furthest moment reached, whatever order the webhooks came in', () => {
    expect(orderState(moments({ deliveredAt: t(5), shippedAt: t(2) }), new Date())).toBe('delivered')
  })
  it('an RTO outranks a delivery attempt', () => {
    expect(orderState(moments({ shippedAt: t(2), ndrAt: t(4), rtoInitiatedAt: t(6) }), new Date())).toBe('rto')
  })
  it('held, then confirmed (confirm clears held_at), then packed; cancel outranks all of them', () => {
    expect(orderState(moments({ heldAt: t(2) }), new Date())).toBe('held')
    expect(orderState(moments({ confirmedAt: t(2) }), new Date())).toBe('confirmed')
    expect(orderState(moments({ confirmedAt: t(2), heldAt: t(3) }), new Date())).toBe('held') // undo of a confirm-from-hold restores held_at
    expect(orderState(moments({ confirmedAt: t(2), packedAt: t(3) }), new Date())).toBe('packed')
    expect(orderState(moments({ confirmedAt: t(2), packedAt: t(3), cancelledAt: t(4) }), new Date())).toBe('cancelled')
    expect(orderState(moments({ packedAt: t(3), shippedAt: t(4) }), new Date())).toBe('shipped')
  })
  it('queues only what a merchant must act on', () => {
    expect(needsAction('unconfirmed')).toBe(true)
    expect(needsAction('held')).toBe(true)
    expect(needsAction('refund_due')).toBe(true)
    expect(needsAction('ndr')).toBe(true)
    expect(needsAction('delivered')).toBe(false)
    expect(needsAction('packed')).toBe(false)
  })
})

describe('paying online', () => {
  const now = t(10)
  const online = (o: Partial<OrderMoments>) => moments({ placedAt: t(9), paymentMethod: 'prepaid', payBy: t(9), ...o })
  it('waits, then is abandoned; paid is ready to pack; COD after a switch', () => {
    expect(orderState(online({ placedAt: t(10), payBy: t(11) }), now)).toBe('awaiting_payment')
    expect(orderState(online({}), now)).toBe('payment_abandoned')
    expect(orderState(online({ paidAt: t(9) }), now)).toBe('paid')
    expect(orderState(online({ switchedToCodAt: t(9) }), now)).toBe('unconfirmed')
    expect(isPlaced(online({}))).toBe(false)
    expect(isPlaced(moments({ cancelledAt: t(2) }))).toBe(true) // a cancelled order was placed
    expect(isPlaced(online({ cancelledAt: t(9) }))).toBe(false) // …but an online order never paid was never placed
    expect(isHolding(online({ placedAt: t(10), payBy: t(11) }), now)).toBe(true)
    expect(isHolding(online({ placedAt: t(10), payBy: t(11), cancelledAt: t(10) }), now)).toBe(false)
    expect(isStanding(moments({ cancelledAt: t(2), deliveredAt: t(3) }))).toBe(false)
  })
  it('an offer row is used by the way it is for: online only, on delivery only, or both (shop stress test 2026-11-11)', () => {
    const holding = online({ placedAt: t(10), payBy: t(11) }), switched = online({ switchedToCodAt: t(9) }), paid = online({ paidAt: t(9) })
    expect(offerWay('payment', null)).toBe('prepaid')
    expect(offerWay('order', 'prepaid')).toBe('prepaid')
    expect(offerWay('order', 'cod')).toBe('cod')
    expect(offerWay('order', null)).toBe('both')
    // Holding: every row is held (it may still be paid, or switched).
    expect([usesDiscount(holding, 'prepaid', now), usesDiscount(holding, 'cod', now), usesDiscount(holding, 'both', now)]).toEqual([true, true, true])
    // A switch gives back what was online only; a capture gives back what was on delivery only.
    expect([usesDiscount(switched, 'prepaid', now), usesDiscount(switched, 'cod', now), usesDiscount(switched, 'both', now)]).toEqual([false, true, true])
    expect([usesDiscount(paid, 'prepaid', now), usesDiscount(paid, 'cod', now), usesDiscount(paid, 'both', now)]).toEqual([true, false, true])
    // Abandoned: nothing.
    expect([usesDiscount(online({}), 'prepaid', now), usesDiscount(online({}), 'cod', now), usesDiscount(online({}), 'both', now)]).toEqual([false, false, false])
    expect(usesDiscount(moments(), 'cod', now)).toBe(true)
  })
  it('paid beats a switch to COD, and says so', () => {
    const o = online({ switchedToCodAt: t(9), paidAt: t(10) })
    expect(orderState(o, now)).toBe('paid')
    expect(currentMethod(o)).toBe('prepaid')
    expect(paidAfterSwitch(o)).toBe(true)
    expect(currentMethod({ paymentMethod: 'prepaid', paidAt: null, switchedToCodAt: t(9) })).toBe('cod')
  })
  it('paid but its stock sold out first: refund due, even if held; a paid order can be held', () => {
    expect(orderState(online({ paidAt: t(9), stockShort: true }), now)).toBe('refund_due')
    expect(orderState(online({ paidAt: t(9), stockShort: true, heldAt: t(9) }), now)).toBe('refund_due')
    expect(orderState(online({ paidAt: t(9), heldAt: t(9) }), now)).toBe('held')
    expect(orderState(online({ paidAt: t(9), stockShort: true, packedAt: t(10) }), now)).toBe('packed')
  })
})

describe('the queue and the shopper', () => {
  it('puts every state in at most one tab; refund due waits with To confirm', () => {
    expect(queueTab('unconfirmed')).toBe('to_confirm')
    expect(queueTab('refund_due')).toBe('to_confirm')
    expect(queueTab('confirmed')).toBe('to_pack')
    expect(queueTab('paid')).toBe('to_pack')
    expect(queueTab('held')).toBe('on_hold')
    expect(queueTab('awaiting_payment')).toBe('not_paid')
    // Ship S·0: the shipping tabs; an order with an outcome waits nowhere.
    expect(queueTab('packed')).toBe('to_ship')
    expect(queueTab('shipped')).toBe('on_the_way')
    expect(queueTab('ndr')).toBe('couldnt_deliver')
    expect(queueTab('rto')).toBe('coming_back')
    for (const s of ['delivered', 'rto_received', 'cancelled', 'lost', 'payment_abandoned'] as const) expect(queueTab(s)).toBe(s === 'payment_abandoned' ? 'not_paid' : null)
    // Lost by the courier: after delivered and returns, before cancelled; the shopper hears of a delivery problem.
    expect(orderState(moments({ packedAt: t(3), shippedAt: t(4), lostAt: t(6) }), new Date(2026, 10, 9))).toBe('lost')
    expect(orderState(moments({ packedAt: t(3), shippedAt: t(4), lostAt: t(6), deliveredAt: t(7) }), new Date(2026, 10, 9))).toBe('delivered')
    expect(orderState(moments({ packedAt: t(3), shippedAt: t(4), lostAt: t(6), rtoInitiatedAt: t(7) }), new Date(2026, 10, 9))).toBe('rto')
    expect(shopperState('lost')).toBe('delivery_problem')
  })
  it('cash is kept ready only while the parcel can still reach the door', () => {
    const ready = SHOPPER_STATES.filter(cashAtDoor)
    expect(ready).toEqual(['confirming', 'confirmed', 'packed', 'shipped', 'ndr'])
  })
  it('never tells a shopper an internal word', () => {
    for (const s of ORDER_STATES) expect(['held', 'refund_due', 'unconfirmed', 'rto', 'rto_received', 'payment_abandoned']).not.toContain(shopperState(s))
    expect(shopperState('held')).toBe('confirming')
    expect(shopperState('refund_due')).toBe('confirming')
  })
})

describe('enteredAt: when an order entered the tab it waits in', () => {
  const now = t(20)
  it('placed, or switched to COD, for To confirm; paid when a refund is due', () => {
    expect(enteredAt(moments(), now)).toEqual(t(1))
    expect(enteredAt(moments({ paymentMethod: 'prepaid', switchedToCodAt: t(2) }), now)).toEqual(t(2))
    expect(enteredAt(moments({ paymentMethod: 'prepaid', paidAt: t(3), stockShort: true }), now)).toEqual(t(3))
  })
  it('confirmed or paid for To pack; held for On hold; the shipping moment for the shipping tabs; null elsewhere', () => {
    expect(enteredAt(moments({ confirmedAt: t(4) }), now)).toEqual(t(4))
    expect(enteredAt(moments({ paymentMethod: 'prepaid', paidAt: t(5) }), now)).toEqual(t(5))
    expect(enteredAt(moments({ heldAt: t(6) }), now)).toEqual(t(6))
    expect(enteredAt(moments({ confirmedAt: t(4), packedAt: t(7) }), now)).toEqual(t(7))
    expect(enteredAt(moments({ confirmedAt: t(4), packedAt: t(7), shippedAt: t(8) }), now)).toEqual(t(8))
    expect(enteredAt(moments({ confirmedAt: t(4), packedAt: t(7), shippedAt: t(8), ndrAt: t(9) }), now)).toEqual(t(9))
    expect(enteredAt(moments({ confirmedAt: t(4), packedAt: t(7), shippedAt: t(8), rtoInitiatedAt: t(10) }), now)).toEqual(t(10))
    expect(enteredAt(moments({ confirmedAt: t(4), packedAt: t(7), shippedAt: t(8), deliveredAt: t(10) }), now)).toBeNull()
    expect(enteredAt(moments({ cancelledAt: t(7) }), now)).toBeNull()
    expect(enteredAt(moments({ paymentMethod: 'prepaid', payBy: t(30) }), now)).toBeNull()
  })
})

describe('paidAfterPacking', () => {
  const t = (m: number) => new Date(Date.UTC(2026, 10, 7, 10, m))
  it('only a switched order paid online after it was packed', () => {
    expect(paidAfterPacking({ switchedToCodAt: t(0), packedAt: t(10), paidAt: t(20) })).toBe(true)
    expect(paidAfterPacking({ switchedToCodAt: t(0), packedAt: t(20), paidAt: t(10) })).toBe(false) // paid first: re-priced, nothing owed twice
    expect(paidAfterPacking({ switchedToCodAt: null, packedAt: t(10), paidAt: t(20) })).toBe(false)
    expect(paidAfterPacking({ switchedToCodAt: t(0), packedAt: null, paidAt: t(20) })).toBe(false)
  })
})
