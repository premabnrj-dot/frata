// =============================================================================
// FILE: src/domains/messaging/events.ts — WHICH ORDER EVENT TELLS THE SHOPPER WHAT (email now; WhatsApp at M·1 reads
// the same list: ADR-0010, one engine). Pure. The writers in src/lib/orders/ enqueue one message per event, keyed by
// the event, so an undone-and-redone step sends again (plan 2026-11-11-email, decision 6).
// =============================================================================

export const ORDER_MESSAGES = ['confirmed', 'finish_paying', 'shipped', 'delivered', 'cancelled'] as const
export type OrderMessage = (typeof ORDER_MESSAGES)[number]

const MINUTE = 60_000

/** How long a message waits before it sends: long enough for an Undo (plan decision 7). Finish paying waits for pay_by. */
export const WAIT_MS: Record<OrderMessage, number> = {
  confirmed: 0,
  finish_paying: MINUTE,
  shipped: 5 * MINUTE,
  delivered: 5 * MINUTE,
  cancelled: 0,
}

/** When a message may first send: now + its wait, or (finish paying) a minute after the order's pay_by. */
export function sendAfter(kind: OrderMessage, now: Date, payBy: Date | null = null): Date {
  if (kind === 'finish_paying' && payBy) return new Date(Math.max(now.getTime(), payBy.getTime()) + WAIT_MS.finish_paying)
  return new Date(now.getTime() + WAIT_MS[kind])
}

/** The outbox dedupe key: one message per kind per event (an order can be shipped, undone and shipped again). */
export const messageKey = (channel: 'email', kind: OrderMessage, eventId: string) => `${channel}:${kind}:${eventId}`
