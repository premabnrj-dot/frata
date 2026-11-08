// =============================================================================
// FILE: src/domains/orders/outcomes.ts
//
// WHAT HAPPENED TO A PARCEL, as Frrata bills on it (Ship S·0; analytics call E, owner 2026-11-08). The writer of
// outcome dates is src/lib/orders/outcomes.ts; these are its rules. Pure.
// =============================================================================

import { monthStartIST } from '@/domains/time/month'

const DAY = 86_400_000
/** After this many days shipped with no outcome, an order counts as delivered for Frrata's fee (call E). */
export const ASSUME_DELIVERED_DAYS = 30

type Outcome = { shippedAt: Date | null; deliveredAt: Date | null; rtoInitiatedAt: Date | null; lostAt: Date | null }

/**
 * When an order became a delivered order for Frrata's per-delivered-order fee (billing B0, the one rule): delivered;
 * or shipped and 30 days passed with no outcome, whichever came first. Null when it came back or the courier lost it,
 * and when it was never shipped (packed and never shipped is never billed: owner, 2026-11-08). Its SQL twin is
 * `billableAtSql` (src/lib/db/order-predicates.ts), held equal by a parity test.
 */
export function billableAt(o: Outcome): Date | null {
  // The same ranking as orderState: a return outranks delivered; delivered outranks lost.
  if (o.rtoInitiatedAt) return null
  const assumed = o.shippedAt ? new Date(o.shippedAt.getTime() + ASSUME_DELIVERED_DAYS * DAY) : null
  if (o.deliveredAt) return assumed && assumed.getTime() < o.deliveredAt.getTime() ? assumed : o.deliveredAt
  if (!o.shippedAt || o.lostAt) return null
  return assumed
}

/** Whether an order counts as delivered for the fee at `now`: billableAt read at one moment (its tests hold the rule). */
export function billableDelivered(o: Outcome, now: Date): boolean {
  const at = billableAt(o)
  return at !== null && at.getTime() <= now.getTime()
}

/** An outcome (Delivered, Came back, Lost) can be undone until the IST month it was marked in is over (it is billed then). */
export const outcomeUndoOpen = (markedAt: Date, now: Date) => monthStartIST(markedAt).getTime() === monthStartIST(now).getTime()

/**
 * Whether Shipped can be undone: within its IST month, and never once the order counts as delivered for the fee
 * (30 days shipped): un-shipping and shipping again would restart that clock (unit-economics review 2026-11-08).
 */
export const shippedUndoOpen = (shippedAt: Date, now: Date) =>
  outcomeUndoOpen(shippedAt, now) && now.getTime() - shippedAt.getTime() < ASSUME_DELIVERED_DAYS * DAY
