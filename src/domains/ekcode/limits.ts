// =============================================================================
// FILE: src/domains/ekcode/limits.ts — EKCODE'S LIMITS AS DATA (plan task 1; reviews 2026-11-09). The SQL definer
// `ekcode_issue_code` enforces them atomically from the `ekcode_settings` row; this file is the seed for that row, the
// bounds Admin cannot cross, and what the tests check. Pure.
// =============================================================================

export type PlanKey = 'launch' | 'growth' | 'scale'

export type Limits = {
  /** Codes to one number in 10 minutes, and in a day. */
  perNumber10m: number
  perNumberDay: number
  /** Wrong tries before a code is used up. */
  triesPerCode: number
  /** Codes from one network bucket (IPv4 /24 or IPv6 /64) in an hour; from one IPv6 /48 in an hour. */
  perNetworkHour: number
  perWideNetworkHour: number
  /** Codes from every shop together in an hour (the backstop for Meta's 80 msg/s and for bot farms). */
  globalHour: number
  /** Codes one shop may send in a day, by plan (owner, 2026-11-09). Admin may raise one shop. */
  perShopDay: Record<PlanKey, number>
  /** The breaker: below this share right, after this many codes from distinct networks in 24 h. */
  breakerMinRight: number
  breakerAfter: number
}

export const DEFAULT_LIMITS: Limits = {
  perNumber10m: 3,
  perNumberDay: 10,
  triesPerCode: 5,
  perNetworkHour: 20,
  perWideNetworkHour: 60,
  globalHour: 2_000,
  perShopDay: { launch: 100, growth: 600, scale: 2_000 },
  breakerMinRight: 0.4,
  breakerAfter: 200,
}

/** What Admin may set (security L3): a limit can be tightened or loosened, never switched off. */
export const LIMIT_BOUNDS: Record<Exclude<keyof Limits, 'perShopDay' | 'breakerMinRight'>, [number, number]> & {
  perShopDay: [number, number]
  breakerMinRight: [number, number]
} = {
  perNumber10m: [1, 5],
  perNumberDay: [3, 20],
  triesPerCode: [3, 10],
  perNetworkHour: [5, 100],
  perWideNetworkHour: [20, 500],
  globalHour: [100, 50_000],
  perShopDay: [20, 20_000],
  breakerMinRight: [0.1, 0.8],
  breakerAfter: [50, 2_000],
}

/** The limits with every value inside its bounds; anything else is refused by `ekcode_admin_set` too. */
export function withinBounds(l: Limits): boolean {
  const ok = (v: number, [lo, hi]: [number, number]) => Number.isFinite(v) && v >= lo && v <= hi
  return ok(l.perNumber10m, LIMIT_BOUNDS.perNumber10m) && ok(l.perNumberDay, LIMIT_BOUNDS.perNumberDay)
    && ok(l.triesPerCode, LIMIT_BOUNDS.triesPerCode) && ok(l.perNetworkHour, LIMIT_BOUNDS.perNetworkHour)
    && ok(l.perWideNetworkHour, LIMIT_BOUNDS.perWideNetworkHour) && ok(l.globalHour, LIMIT_BOUNDS.globalHour)
    && (['launch', 'growth', 'scale'] as const).every((p) => ok(l.perShopDay[p], LIMIT_BOUNDS.perShopDay))
    && ok(l.breakerMinRight, LIMIT_BOUNDS.breakerMinRight) && ok(l.breakerAfter, LIMIT_BOUNDS.breakerAfter)
}

/**
 * Proof-of-work difficulty for the n-th code from one network in an hour (security H4): none for the first, then
 * 16 + 2·(n−2) leading zero bits, capped at 24. `extra` is added while a shop's breaker is tripped (owner call 3: the
 * breaker slows codes down; only Admin pauses a shop).
 */
export function powBits(nthCodeThisHour: number, extra = 0): number {
  if (nthCodeThisHour < 2) return 0
  return Math.min(24, 16 + 2 * (nthCodeThisHour - 2) + extra)
}

/** The breaker trips when enough codes went out and too few were typed right. */
export function breakerTripped(sent: number, right: number, l: Pick<Limits, 'breakerAfter' | 'breakerMinRight'> = DEFAULT_LIMITS): boolean {
  return sent >= l.breakerAfter && right / sent < l.breakerMinRight
}

/** A shop's daily cap: its plan's, or the higher number Admin raised it to. */
export function shopDayCap(plan: PlanKey, raisedTo: number | null, l: Pick<Limits, 'perShopDay'> = DEFAULT_LIMITS): number {
  return Math.max(l.perShopDay[plan], raisedTo ?? 0)
}
