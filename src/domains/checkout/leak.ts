// =============================================================================
// FILE: src/domains/checkout/leak.ts — the leak alert on a creator code (docs/plans/2026-11-08-offers-o3-o4.md § O·3).
//
// A creator code is meant to travel by its creator's link. It is flagged "leak?" when, with at least 10 uses in the
// last 7 days, either (a) under half of them arrived through the link (the code is being typed: a coupon site, a
// group chat), or (b) the week ran at more than 3x the code's usual week over the 28 days before it. The alert says
// which, and never acts by itself: codes cannot be removed, so the remedy it names is ending the offer. Pure.
// =============================================================================

const LEAK_MIN_USES = 10

export type CodeWeek = {
  /** Uses in the last 7 days, and how many of them came through the creator's link. */
  last7: number
  viaLink7: number
  /** Uses in the 28 days before those 7. */
  prev28: number
  /** How many of those 28 days the code existed (0–28): a younger code's usual week is judged on its own days. */
  prevDays: number
}

export type LeakReason = 'typed' | 'spike'
export type Leak = { reasons: LeakReason[]; text: string } | null

const SAY: Record<LeakReason, (w: CodeWeek) => string> = {
  typed: (w) => `${w.last7 - w.viaLink7} of its ${w.last7} uses this week were typed, not from the creator's link`,
  spike: () => 'this week ran at more than 3 times its usual week',
}

/** The leak alert for one creator code, or null. */
export function leakOf(w: CodeWeek): Leak {
  if (w.last7 < LEAK_MIN_USES) return null
  const reasons: LeakReason[] = []
  if (w.viaLink7 * 2 < w.last7) reasons.push('typed')
  // No usual week (under 7 days before this one, or no use at all): a creator's first busy week is not a spike.
  if (w.prevDays >= 7 && w.prev28 > 0 && w.last7 * w.prevDays > 3 * 7 * w.prev28) reasons.push('spike')
  if (!reasons.length) return null
  const why = reasons.map((r) => SAY[r](w)).join('; and ')
  return { reasons, text: `Leak? ${why[0]!.toUpperCase()}${why.slice(1)}. If it has spread, end the offer: codes cannot be removed, and ending it ends it for every creator.` }
}
