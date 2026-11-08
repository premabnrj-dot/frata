// =============================================================================
// FILE: src/domains/orders/order-state.ts
//
// AN ORDER'S STATE IS DERIVED FROM ITS TIMESTAMPS, never stored (from Ekatan:
// a status column and the timestamps beside it disagree the first time a
// webhook arrives out of order). Each event writes the moment it happened;
// this reads the furthest one reached. The SQL that filters by state (queue
// tabs, counts, holds) lives in src/lib/db/order-predicates.ts and is
// tested against this file on real rows.
//
// Every moment is REQUIRED (null when it has not happened): a query that
// forgets to select one fails to compile instead of giving a wrong state.
// =============================================================================

export type OrderMoments = {
  placedAt: Date
  /** What the shopper chose: cod | prepaid. */
  paymentMethod: 'cod' | 'prepaid' | string
  /** An unpaid online order holds its stock until then. */
  payBy: Date | null
  paidAt: Date | null
  switchedToCodAt: Date | null
  confirmedAt: Date | null
  heldAt: Date | null
  /** Packing issues the invoice number. */
  packedAt: Date | null
  cancelledAt: Date | null
  shippedAt: Date | null
  /** Latest failed delivery attempt not yet resolved. */
  ndrAt: Date | null
  deliveredAt: Date | null
  /** The courier lost the parcel (Ship): an outcome, never billed. */
  lostAt: Date | null
  rtoInitiatedAt: Date | null
  rtoDeliveredAt: Date | null
  /** Paid, and an in-stock line's stock was never taken (it sold out before the capture): the money goes back. */
  stockShort: boolean
}

export const ORDER_STATES = [
  'awaiting_payment', 'payment_abandoned', 'unconfirmed', 'held', 'confirmed', 'paid', 'refund_due', 'packed',
  'cancelled', 'shipped', 'ndr', 'delivered', 'rto', 'rto_received', 'lost',
] as const
export type OrderState = (typeof ORDER_STATES)[number]

/**
 * The furthest moment reached, in this order (each line outranks the ones below):
 *   returned (rto_received > rto) > delivered > lost by the courier > cancelled > delivery failed (ndr) > shipped > packed
 *   paid online → refund_due (sold out before capture) > held > paid ("To pack": confirming is for COD)
 *   online, unpaid, not switched → awaiting_payment inside pay_by, payment_abandoned after
 *   COD (chosen, or switched to) → held > confirmed > unconfirmed
 * Paid always beats a switch to COD (a capture can land after the switch). Confirm and unhold clear held_at.
 */
export function orderState(o: OrderMoments, now: Date): OrderState {
  if (o.rtoDeliveredAt) return 'rto_received'
  if (o.rtoInitiatedAt) return 'rto'
  if (o.deliveredAt) return 'delivered'
  if (o.lostAt) return 'lost'
  if (o.cancelledAt) return 'cancelled'
  if (o.ndrAt) return 'ndr'
  if (o.shippedAt) return 'shipped'
  if (o.packedAt) return 'packed'
  if (o.paidAt) return o.stockShort ? 'refund_due' : o.heldAt ? 'held' : 'paid'
  if (o.paymentMethod === 'prepaid' && !o.switchedToCodAt) return o.payBy && o.payBy > now ? 'awaiting_payment' : 'payment_abandoned'
  if (o.heldAt) return 'held'
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

/**
 * Paid online AFTER it was packed as Pay on delivery: the slip may already be with the courier asking for cash, so
 * the shopper can pay twice, and the issued invoice keeps its COD figures (markPaid never rewrites it). A person
 * settles it: tell the courier, or refund the online payment (unit-economics review 2026-11-07).
 */
export const paidAfterPacking = (o: Pick<OrderMoments, 'paidAt' | 'switchedToCodAt' | 'packedAt'>) =>
  !!(o.paidAt && o.switchedToCodAt && o.packedAt && o.paidAt.getTime() > o.packedAt.getTime())

/**
 * A placed order: anything but an online order never paid and never switched to COD — even once cancelled
 * (the state alone cannot tell: found by the parity test, 2026-11-07). What a merchant counts and what plan
 * usage bills (`app_admin_order_counts`, drizzle/0017 — a cancelled order counts).
 */
export const isPlaced = (o: Pick<OrderMoments, 'paymentMethod' | 'paidAt' | 'switchedToCodAt'>) => !(o.paymentMethod === 'prepaid' && !o.paidAt && !o.switchedToCodAt)

/** Placed and never cancelled: its lines still count against stock and pre-order caps (by the cancel timestamp, whatever state outranks it). */
export const isStanding = (o: Pick<OrderMoments, 'paymentMethod' | 'paidAt' | 'switchedToCodAt' | 'cancelledAt'>) => isPlaced(o) && !o.cancelledAt

/** An unpaid online order inside pay_by, not cancelled: its in-stock lines are held (checkout's free stock). */
export const isHolding = (o: Pick<OrderMoments, 'paymentMethod' | 'paidAt' | 'switchedToCodAt' | 'cancelledAt' | 'payBy'>, now: Date) =>
  o.paymentMethod === 'prepaid' && !o.paidAt && !o.switchedToCodAt && !o.cancelledAt && !!o.payBy && o.payBy > now

/**
 * Whether an order is using an offer of `cls` right now (offers: limits, budgets, ₹ given). Order and shipping
 * offers: standing or holding (an abandoned online order gives its use back). The pay-online saving: paid online,
 * or still holding — a switch to COD gives it back (docs/plans/2026-11-08-offers.md, plan review 7).
 */
export const usesDiscount = (o: Pick<OrderMoments, 'paymentMethod' | 'paidAt' | 'switchedToCodAt' | 'cancelledAt' | 'payBy'>, cls: 'product' | 'order' | 'shipping' | 'payment', now: Date) =>
  cls === 'payment' ? (!!o.paidAt && !o.cancelledAt) || isHolding(o, now) : isStanding(o) || isHolding(o, now)

/** States a merchant must act on today. */
export const needsAction = (s: OrderState) => s === 'unconfirmed' || s === 'held' || s === 'refund_due' || s === 'ndr'

// ── The console's work queue (docs/specs/2026-11-07-orders.md § 1D·1) ──

export const QUEUE_TABS = ['couldnt_deliver', 'to_confirm', 'to_pack', 'to_ship', 'on_the_way', 'coming_back', 'on_hold', 'all', 'not_paid'] as const
export type QueueTab = (typeof QUEUE_TABS)[number]
/** The shipping tabs (Ship S·0): orders that have left the work tabs but not yet reached an outcome. */
export const SHIP_TABS = ['to_ship', 'on_the_way', 'couldnt_deliver', 'coming_back'] as const satisfies readonly QueueTab[]

/** The tab an order waits in ('all' holds every placed order besides). Refund due waits with To confirm: a person decides. */
export function queueTab(s: OrderState): Exclude<QueueTab, 'all'> | null {
  if (s === 'unconfirmed' || s === 'refund_due') return 'to_confirm'
  if (s === 'confirmed' || s === 'paid') return 'to_pack'
  if (s === 'held') return 'on_hold'
  if (s === 'awaiting_payment' || s === 'payment_abandoned') return 'not_paid'
  if (s === 'packed') return 'to_ship'
  if (s === 'shipped') return 'on_the_way'
  if (s === 'ndr') return 'couldnt_deliver'
  if (s === 'rto') return 'coming_back'
  return null
}

/**
 * When an order entered the tab it waits in, for "oldest waiting" (U·4 Home): placed (or switched to COD) for To
 * confirm, paid when a refund is due, confirmed or paid for To pack, held for On hold. Null outside the work tabs
 * and the four shipping tabs (packed, shipped, the latest failed attempt, the return started). A held order paid online is On hold, so held_at wins (the state decides). Taking an order off hold
 * clears held_at, so it re-enters To confirm at its placement. enteredAtSql() in src/lib/db/order-predicates.ts is
 * its twin (parity int test).
 */
export function enteredAt(o: OrderMoments, now: Date): Date | null {
  switch (orderState(o, now)) {
    case 'unconfirmed': return o.switchedToCodAt ?? o.placedAt
    case 'refund_due': case 'paid': return o.paidAt
    case 'confirmed': return o.confirmedAt
    case 'held': return o.heldAt
    // The shipping tabs (Ship S·0): packed, shipped, the latest failed attempt, the return started.
    case 'packed': return o.packedAt
    case 'shipped': return o.shippedAt
    case 'ndr': return o.ndrAt
    case 'rto': return o.rtoInitiatedAt
    default: return null
  }
}

// ── What a shopper is told (never the internal word: held, refund_due, a cancel reason) ──

export const SHOPPER_STATES = [
  'confirming', 'confirmed', 'paid', 'packed', 'awaiting_payment', 'not_paid', 'cancelled', 'shipped', 'ndr', 'delivered', 'returning', 'returned',
] as const
export type ShopperState = (typeof SHOPPER_STATES)[number]

export function shopperState(s: OrderState): ShopperState {
  switch (s) {
    case 'unconfirmed': case 'held': case 'refund_due': return 'confirming'
    case 'payment_abandoned': return 'not_paid'
    case 'rto': return 'returning'
    case 'rto_received': return 'returned'
    // Lost by the courier: the shopper is told delivery hit a problem and the shop will be in touch (never "lost").
    case 'lost': return 'ndr'
    default: return s
  }
}
