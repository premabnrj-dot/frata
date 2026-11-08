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

/**
 * Whether an order is a delivered order for Frrata's per-delivered-order fee: delivered; or shipped 30 days ago with no
 * outcome since, unless it came back or the courier lost it. KNOWN COPY: its SQL twin lands with its first reader
 * (billing, roadmap phase 6), with a parity test.
 */
export function billableDelivered(o: { shippedAt: Date | null; deliveredAt: Date | null; rtoInitiatedAt: Date | null; lostAt: Date | null }, now: Date): boolean {
  // The same ranking as orderState: a return outranks delivered; delivered outranks lost.
  if (o.rtoInitiatedAt) return false
  if (o.deliveredAt) return true
  if (!o.shippedAt || o.lostAt) return false
  return now.getTime() - o.shippedAt.getTime() >= ASSUME_DELIVERED_DAYS * DAY
}

/** An outcome (Delivered, Came back, Lost) can be undone until the IST month it was marked in is over (it is billed then). */
export const outcomeUndoOpen = (markedAt: Date, now: Date) => monthStartIST(markedAt).getTime() === monthStartIST(now).getTime()

/**
 * Whether Shipped can be undone: within its IST month, and never once the order counts as delivered for the fee
 * (30 days shipped): un-shipping and shipping again would restart that clock (unit-economics review 2026-11-08).
 */
export const shippedUndoOpen = (shippedAt: Date, now: Date) =>
  outcomeUndoOpen(shippedAt, now) && now.getTime() - shippedAt.getTime() < ASSUME_DELIVERED_DAYS * DAY
