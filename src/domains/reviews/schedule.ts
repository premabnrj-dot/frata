// =============================================================================
// FILE: src/domains/reviews/schedule.ts — when a delivered order is asked, and reminded (Reviews R1).
//
// Asked N days after delivery (the shop's setting, default 5), one reminder M days after the ask (default 3, or
// none). Every delivered or returned order is asked alike (IS 19000), never an RTO or cancelled one, and only with
// the shopper's WhatsApp opt-in. The sweep looks in a fixed window [N+2 days ago, N days ago) so it never re-reads
// orders it has already asked (speed review 3). The link is valid 60 days from delivery.
// =============================================================================

import { orderState, type OrderMoments } from '../orders/order-state'

export const ASK_DAYS = [1, 3, 5, 7, 10, 14] as const
export const REMINDER_DAYS = [0, 3, 5] as const
export const LINK_VALID_DAYS = 60
export const MAX_PHOTOS = 5
export const REVIEW_TYPES = ['both', 'text', 'photo'] as const
const DAY = 86_400_000

export type AskSettings = { askAfterDays: number; remindAfterDays: number }
export const DEFAULT_ASK: AskSettings = { askAfterDays: 5, remindAfterDays: 3 }

/** The delivered-at window the sweep asks in at `now`. */
export function askWindow(s: AskSettings, now: Date): { from: Date; to: Date } {
  return { from: new Date(now.getTime() - (s.askAfterDays + 2) * DAY), to: new Date(now.getTime() - s.askAfterDays * DAY) }
}

/** May this order be asked at all? Its state is the one orderState gives (a returned order stays 'delivered': a credit
 *  note, not a state); never an RTO, a cancelled or a lost one. */
export function askable(o: OrderMoments & { waOptInAt: Date | null; optedOut: boolean }, now: Date): boolean {
  return orderState(o, now) === 'delivered' && !!o.waOptInAt && !o.optedOut
}

export function reminderDue(sentAt: Date, s: AskSettings, now: Date): boolean {
  return s.remindAfterDays > 0 && now.getTime() >= sentAt.getTime() + s.remindAfterDays * DAY
}

export function linkValid(deliveredAt: Date, now: Date): boolean {
  return now.getTime() < deliveredAt.getTime() + LINK_VALID_DAYS * DAY
}
