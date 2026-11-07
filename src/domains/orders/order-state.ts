// =============================================================================
// FILE: src/domains/orders/order-state.ts
//
// AN ORDER'S STATE IS DERIVED FROM ITS TIMESTAMPS, never stored (from Ekatan:
// a status column and the timestamps beside it disagree the first time a
// webhook arrives out of order). Each event writes the moment it happened;
// this reads the furthest one reached.
// =============================================================================

export type OrderMoments = {
  placedAt: Date
  /** What the shopper chose; omitted for orders made before 1C (treated as COD). */
  paymentMethod?: 'cod' | 'prepaid' | string
  /** An unpaid online order holds its stock until then. */
  payBy?: Date | null
  paidAt?: Date | null
  switchedToCodAt?: Date | null
  confirmedAt?: Date | null
  cancelledAt?: Date | null
  shippedAt?: Date | null
  /** Latest failed delivery attempt not yet resolved. */
  ndrAt?: Date | null
  deliveredAt?: Date | null
  rtoInitiatedAt?: Date | null
  rtoDeliveredAt?: Date | null
}

export const ORDER_STATES = [
  'awaiting_payment', 'payment_abandoned', 'unconfirmed', 'confirmed', 'paid', 'cancelled', 'shipped', 'ndr', 'delivered', 'rto', 'rto_received',
] as const
export type OrderState = (typeof ORDER_STATES)[number]

/**
 * The furthest moment reached. Before shipping, how it is paid decides:
 *   online, unpaid, inside pay_by → awaiting_payment; past it → payment_abandoned
 *   paid online → paid ("Ready to pack": confirming is for COD, owner call 5)
 *   COD (chosen, or switched to) → unconfirmed → confirmed
 * Paid always beats a switch to COD (a capture can land after the switch).
 */
export function orderState(o: OrderMoments, now: Date = new Date()): OrderState {
  if (o.rtoDeliveredAt) return 'rto_received'
  if (o.rtoInitiatedAt) return 'rto'
  if (o.deliveredAt) return 'delivered'
  if (o.cancelledAt) return 'cancelled'
  if (o.ndrAt) return 'ndr'
  if (o.shippedAt) return 'shipped'
  if (o.paidAt) return 'paid'
  if (o.paymentMethod === 'prepaid' && !o.switchedToCodAt) return o.payBy && o.payBy > now ? 'awaiting_payment' : 'payment_abandoned'
  if (o.confirmedAt) return 'confirmed'
  return 'unconfirmed'
}

/** How the order is paid now: online once paid, COD once switched (unless paid after all), else as chosen. */
export function currentMethod(o: Pick<OrderMoments, 'paymentMethod' | 'paidAt' | 'switchedToCodAt'>): 'cod' | 'prepaid' {
  if (o.paidAt) return 'prepaid'
  if (o.switchedToCodAt) return 'cod'
  return o.paymentMethod === 'prepaid' ? 'prepaid' : 'cod'
}

/** Paid online after the shopper switched to COD: the courier must not collect. */
export const paidAfterSwitch = (o: Pick<OrderMoments, 'paidAt' | 'switchedToCodAt'>) => !!(o.paidAt && o.switchedToCodAt)

/** Orders that are real (count for the merchant, take stock): not awaiting or abandoned payment. */
export const isReal = (s: OrderState) => s !== 'awaiting_payment' && s !== 'payment_abandoned'

/** States a merchant must act on today — the console's default work queue. */
export function needsAction(state: OrderState): boolean {
  return state === 'unconfirmed' || state === 'ndr'
}
