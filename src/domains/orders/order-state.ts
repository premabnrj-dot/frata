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
  'unconfirmed', 'confirmed', 'cancelled', 'shipped', 'ndr', 'delivered', 'rto', 'rto_received',
] as const
export type OrderState = (typeof ORDER_STATES)[number]

export function orderState(o: OrderMoments): OrderState {
  if (o.rtoDeliveredAt) return 'rto_received'
  if (o.rtoInitiatedAt) return 'rto'
  if (o.deliveredAt) return 'delivered'
  if (o.cancelledAt) return 'cancelled'
  if (o.ndrAt) return 'ndr'
  if (o.shippedAt) return 'shipped'
  if (o.confirmedAt) return 'confirmed'
  return 'unconfirmed'
}

/** States a merchant must act on today — the console's default work queue. */
export function needsAction(state: OrderState): boolean {
  return state === 'unconfirmed' || state === 'ndr'
}
