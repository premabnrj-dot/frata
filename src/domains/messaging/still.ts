import { isStanding, orderState, type OrderMoments } from '@/domains/orders/order-state'
import type { OrderMessage } from './events'

// =============================================================================
// FILE: src/domains/messaging/still.ts — IS THIS MESSAGE STILL TRUE WHEN IT SENDS? Pure. Every message re-reads the
// order at send time (it waited for an Undo); the order's state comes from order-state.ts, never restated here.
// =============================================================================

export type StillCode = 'ok' | 'undone' | 'cancelled' | 'superseded' | 'not_due' | 'paid'

export function stillTrue(kind: OrderMessage, o: OrderMoments, now: Date, undone: boolean): StillCode {
  if (undone) return 'undone'
  const s = orderState(o, now)
  switch (kind) {
    case 'confirmed': return isStanding(o) ? 'ok' : o.cancelledAt ? 'cancelled' : 'not_due'
    case 'finish_paying': return s === 'payment_abandoned' ? 'ok' : o.paidAt ? 'paid' : o.cancelledAt ? 'cancelled' : 'not_due'
    case 'shipped':
      if (o.cancelledAt) return 'cancelled'
      if (!o.shippedAt) return 'not_due'
      // Delivered (or lost, or returning) before this one went: the later message says it.
      return o.deliveredAt || o.lostAt || o.rtoInitiatedAt ? 'superseded' : 'ok'
    case 'delivered': return !o.deliveredAt ? 'not_due' : o.rtoInitiatedAt ? 'superseded' : 'ok'
    case 'cancelled': return o.cancelledAt ? 'ok' : 'not_due'
    // The items changed (an Undo is `undone`); a cancel since says it instead.
    case 'edited': return o.cancelledAt ? 'cancelled' : 'ok'
  }
}
