// =============================================================================
// FILE: src/domains/studio/credits.ts — STUDIO CREDITS: THE RULES (C1·1; spec docs/specs/2026-11-16-studio-agent.md § 6.7
// and § 8, owner decisions 5, 6, 20; plan docs/plans/2026-11-22-c1-credits.md with its reviews and the owner's answers of
// 2026-11-22).
//
// Pure: no clock (every function takes `now`), no I/O. The ledger's definers hold the same rules in SQL and refuse
// first; these decide what a page offers, what the door asks for and what the tests pin. Read today by the Credits and
// billing page, the hourly run and sql-drift.test.ts; the reserve and settle rules (creditsFor, reserveFor, refuseReserve,
// sessionBudgetMicro, drawPlan) wait for their callers, Studio's turns (V3a) and previews (V2a), as the plan sets.
//   - 1 credit = ₹6.33 of LOADED cost; loaded = list cost (USD) × the day's USD/INR reference rate × 1.10 (decision 6).
//     The rate is stored as rupees × 10,000 (FBIL quotes 4 decimals: 94.1997 → 941997). Arithmetic in bigint:
//     micro-USD × rate × basis points passes 2^53 at well under a dollar (review finding).
//   - A use reserves first and is charged after, never above its reserve; the rest comes back.
//   - Credits are drawn soonest use-by first, then oldest, then by id; a test lot never pays for real work.
//   - Budgets warn at 80% and pause at 100%. Limits: 40 credits a turn (120 at most), 300 a person a day,
//     ₹25,000 of list cost a day across Studio (decision 5; the per-person monthly cap is not built, owner 2026-11-22).
// =============================================================================

import { keysMatch, needsFreshNotice, NOTICE_LEAD_MS, noticeStood } from '@/domains/billing/collect'
import { addMonths } from '@/domains/time/month'
import { FREE_DAYS, LOT_MONTHS, type SeatPlan } from './prices'

const DAY = 86_400_000

/** One credit is ₹6.33 of loaded cost (decision 6). */
export const CREDIT_COST_PAISE = 633
/** The loading on list cost, in basis points of 10,000: 1.10 (3% forex, 5% returns, 2% receiving; decision 6). */
export const LOADING_BP = 11_000
/** A rate older than this is refused: the reserve waits rather than prices a turn on a stale rupee (owner 2026-11-22, 6;
 *  FBIL publishes on Mumbai working days, so a long weekend is 4 days). */
export const RATE_MAX_AGE_DAYS = 4

const rateOk = (rateE4: number) => Number.isInteger(rateE4) && rateE4 > 0
/** Paise in a micro-USD figure: micro-USD × (rupees × 10^4) gives paise × 10^8. */
const PAISE_DEN = 100_000_000n

/** Loaded cost in paise, rounded up: micro-USD × rate (rupees × 10^4) × loading (bp) ÷ (10^8 × 10^4). */
export function loadedPaise(listMicroUsd: bigint, rateE4: number, loadingBp = LOADING_BP): bigint {
  if (listMicroUsd < 0n) throw new Error('[credits] list cost below zero')
  if (!rateOk(rateE4)) throw new Error('[credits] a rate must be a whole number above 0 (rupees × 10,000)')
  const num = listMicroUsd * BigInt(rateE4) * BigInt(loadingBp)
  const den = PAISE_DEN * 10_000n
  return (num + den - 1n) / den
}

/** A use's credits: ⌈loaded cost ÷ ₹6.33⌉ (decision 6). */
export function creditsFor(listMicroUsd: bigint, rateE4: number, loadingBp = LOADING_BP): number {
  const p = loadedPaise(listMicroUsd, rateE4, loadingBp)
  return Number((p + BigInt(CREDIT_COST_PAISE) - 1n) / BigInt(CREDIT_COST_PAISE))
}

/** List cost in micro-USD that a number of credits buys at a rate (the session's Managed Agents budget, § 6.7). */
export function microUsdFor(credits: number, rateE4: number, loadingBp = LOADING_BP): bigint {
  if (!Number.isInteger(credits) || credits < 0) throw new Error('[credits] credits must be a whole number')
  if (!rateOk(rateE4)) throw new Error('[credits] a rate must be a whole number above 0 (rupees × 10,000)')
  return (BigInt(credits) * BigInt(CREDIT_COST_PAISE) * PAISE_DEN * 10_000n) / (BigInt(rateE4) * BigInt(loadingBp))
}

/** List cost in paise (no loading), rounded up: what the platform's daily ceiling counts. */
export const listPaise = (listMicroUsd: bigint, rateE4: number): bigint => (listMicroUsd * BigInt(rateE4) + PAISE_DEN - 1n) / PAISE_DEN

/** A rate as written ("94.1997") → rupees × 10,000, exactly (never through a float); null when it isn't one. */
export function parseRate(text: string): number | null {
  const m = /^(\d{2,3})(?:\.(\d{1,4}))?$/.exec(text.trim())
  if (!m) return null
  const v = Number(m[1]) * 10_000 + Number((m[2] ?? '').padEnd(4, '0'))
  return v >= 50_0000 && v <= 200_0000 ? v : null
}

/** Whether a stored rate may price a use now. */
export const rateUsable = (rateDay: Date | null, now: Date) => !!rateDay && now.getTime() - rateDay.getTime() <= RATE_MAX_AGE_DAYS * DAY

// ── Lots: what a partner holds, and which pays first ────────────────────────────────────────────────────────────────

export const LOT_KINDS = ['grant', 'pack', 'credits', 'seat', 'return'] as const
export type LotKind = (typeof LOT_KINDS)[number]

export { addMonths }

/** A use-by date: 12 months for anything bought (and a credit returned after its lot ended); 90 days for the free 20. */
export function expiresAt(kind: LotKind, from: Date): Date {
  return kind === 'grant' ? new Date(from.getTime() + FREE_DAYS * DAY) : addMonths(from, LOT_MONTHS)
}

export type Lot = { id: string; kind: LotKind; left: number; expiresAt: Date; createdAt: Date; test: boolean }

/** Soonest use-by first, then the oldest, then by id: the order every draw takes (the definer sorts the same). */
export const lotOrder = (a: Lot, b: Lot) =>
  a.expiresAt.getTime() - b.expiresAt.getTime() || a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** Live lots a draw may take: not past their use-by, with credits left, and never a test lot where money is real. */
export const usable = (lots: readonly Lot[], now: Date, realMoney: boolean) =>
  lots.filter((l) => l.left > 0 && l.expiresAt.getTime() > now.getTime() && !(realMoney && l.test)).sort(lotOrder)

export const balanceOf = (lots: readonly Lot[], now: Date, realMoney: boolean) => usable(lots, now, realMoney).reduce((a, l) => a + l.left, 0)

/** Which lots pay for n credits, in order; null when they don't hold n. */
export function drawPlan(lots: readonly Lot[], n: number, now: Date, realMoney: boolean): { lotId: string; credits: number }[] | null {
  if (!Number.isInteger(n) || n <= 0) return null
  const out: { lotId: string; credits: number }[] = []
  let need = n
  for (const l of usable(lots, now, realMoney)) {
    const take = Math.min(l.left, need)
    out.push({ lotId: l.id, credits: take })
    need -= take
    if (need === 0) return out
  }
  return null
}

/** What a use is charged and what comes back: never above the reserve (§ 6.7). */
export function settle(reserved: number, used: number): { charged: number; back: number } {
  if (!Number.isInteger(reserved) || reserved < 0 || !Number.isFinite(used)) throw new Error('[credits] settle needs a whole reserve and a measured use')
  const charged = Math.max(0, Math.min(reserved, Math.ceil(used)))
  return { charged, back: reserved - charged }
}

// ── Budgets and limits ──────────────────────────────────────────────────────────────────────────────────────────────

export type BudgetState = 'none' | 'ok' | 'warn' | 'paused'
export const WARN_PCT = 80
/** A client's budget: warns at 80%, pauses at 100% (drafts kept). No budget: 'none' (nothing paused). */
export function budgetState(used: number, budget: number | null): BudgetState {
  if (budget === null) return 'none'
  if (used >= budget) return 'paused'
  return used * 100 >= budget * WARN_PCT ? 'warn' : 'ok'
}
/** Set budget never goes below what is used (the 13 Nov rule; the undrawn mockup's "Set 300 or more"). */
export const MAX_BUDGET = 100_000
export const budgetValid = (credits: number, used: number) => Number.isInteger(credits) && credits >= used && credits >= 1 && credits <= MAX_BUDGET
/** Raise by 50 (22 Nov page). */
export const RAISE_STEP = 50
/** A new website's budget unless the owner changes it ("New websites start at 300"). */
export const NEW_SITE_BUDGET = 300

export const LIMITS = {
  turnDefault: 40,
  turnMax: 120,
  personDay: 300,
  /** ₹25,000 of LIST cost a day across Studio, for the first three months (decision 5). */
  platformDayListPaise: 25_000_00n,
} as const

/** A use's reserve within the turn limits. */
export const reserveFor = (estimate: number | null) =>
  Math.min(LIMITS.turnMax, Math.max(1, Math.ceil(estimate !== null && Number.isFinite(estimate) ? estimate : LIMITS.turnDefault)))

export type Refusal = 'balance' | 'budget' | 'person_day' | 'platform_day' | 'rate' | 'not_live'
/** The door's checks, in the order the definer runs them, from figures it read (pure, so the test pins the order). */
export function refuseReserve(x: { credits: number; balance: number; budgetUsed: number; budget: number | null; personToday: number; platformListToday: bigint; rateOk: boolean }): Refusal | null {
  if (!x.rateOk) return 'rate'
  if (x.platformListToday >= LIMITS.platformDayListPaise) return 'platform_day'
  if (x.personToday + x.credits > LIMITS.personDay) return 'person_day'
  if (x.budget !== null && x.budgetUsed + x.credits > x.budget) return 'budget'
  if (x.balance < x.credits) return 'balance'
  return null
}

/** The session's Managed Agents budget for a turn (§ 6.7, architecture M5), in micro-USD: spend so far + the turn's ceiling
 *  − the largest single request so far ($0.60 at first) − the estimated preview builds. Never below zero. */
export function sessionBudgetMicro(x: { spentMicro: bigint; ceilingMicro: bigint; largestMicro: bigint | null; buildsMicro: bigint }): bigint {
  const b = x.spentMicro + x.ceilingMicro - (x.largestMicro ?? 600_000n) - x.buildsMicro
  return b > 0n ? b : 0n
}

// ── Alerts ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The banner on Credits and billing below 20; the email below 50 (owner 2026-11-22, h). */
export const LOW_BANNER = 20
export const LOW_EMAIL = 50
/** A threshold is crossed when a draw takes the figure from at-or-above to below it: one email a crossing. */
export const crossedBelow = (before: number, after: number, line: number) => before >= line && after < line
export const crossedWarn = (usedBefore: number, usedAfter: number, budget: number | null) =>
  budget !== null && budgetState(usedBefore, budget) === 'ok' && budgetState(usedAfter, budget) !== 'ok'

// ── The seat ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** A failed renewal is retried on days 1, 3 and 5; on day 7 the plan becomes Partner (owner 2026-11-22, f). */
export const RETRY_DAYS = [1, 3, 5] as const
export const LAPSE_DAYS = 7
/** A card debit with a notification object waits 36 h 5 min after its order (Razorpay, checked 2026-11-22): 37 h here. */
export const CARD_NOTICE_LEAD_MS = 37 * 3_600_000

export type Seat = { plan: SeatPlan; periodEnd: Date; cancelAt: Date | null; failedAt: Date | null; endedAt: Date | null; nextPlan: SeatPlan | null }
export type SeatState = 'partner' | 'active' | 'ending' | 'failed'

/** A failed seat lapses to Partner on day 7 (one rule for the page and the hourly run). */
export const lapsed = (s: Pick<Seat, 'failedAt'>, now: Date) => !!s.failedAt && now.getTime() >= s.failedAt.getTime() + LAPSE_DAYS * DAY

/** Where a seat stands, from its timestamps (never stored). */
export function seatState(s: Seat | null, now: Date): SeatState {
  if (!s || (s.endedAt && s.endedAt.getTime() <= now.getTime())) return 'partner'
  if (s.failedAt) return lapsed(s, now) ? 'partner' : 'failed'
  if (s.cancelAt) return now.getTime() >= s.cancelAt.getTime() ? 'partner' : 'ending'
  return 'active'
}

/** The plan the next period runs on: a change waits for the renewal (owner 2026-11-22, d). */
export const renewalPlan = (s: Pick<Seat, 'plan' | 'nextPlan'>): SeatPlan => s.nextPlan ?? s.plan

/** The next period's end: the same day next month (a 31st falls to the month's last day). */
export const nextPeriodEnd = (end: Date): Date => addMonths(end, 1)

export type Renewal = { seat: Seat; method: 'upi' | 'card'; attempts: number; pending: number; noticeQueuedAt: Date | null; noticeSentAt: Date | null; lastFailedAt: Date | null; mandate: boolean; partnerLive: boolean; testMode: boolean }
export type RenewalStep = { kind: 'notice'; debitAt: Date } | { kind: 'debit'; attempt: number } | { kind: 'lapse' } | { kind: 'end' } | { kind: 'wait'; why: string }

/**
 * What the hourly run does for a seat (security H2, architecture M5, owner f). A debit goes only after its notice was
 * SENT and has stood its lead (25 h for UPI, 37 h for a card: a queued notice is not a notice); every retry needs its own
 * notice (billing's own needsFreshNotice); retries on days 1, 3, 5 after the first failure; Partner on day 7. A
 * cancelled seat, a suspended partner or no mandate ends at the period's end.
 */
export function renewalStep(r: Renewal, now: Date, gatewayIsTest: boolean): RenewalStep {
  const t = now.getTime(), s = r.seat
  const lead = r.method === 'card' ? CARD_NOTICE_LEAD_MS : NOTICE_LEAD_MS
  if (s.endedAt) return { kind: 'wait', why: 'ended' }
  if (lapsed(s, now)) return { kind: 'lapse' }
  if (t < s.periodEnd.getTime() - lead - DAY) return { kind: 'wait', why: 'not due' }
  if (s.cancelAt || !r.partnerLive || !r.mandate) return t >= s.periodEnd.getTime() ? { kind: 'end' } : { kind: 'wait', why: 'ends at the period end' }
  if (!keysMatch(r.testMode, gatewayIsTest)) return { kind: 'wait', why: r.testMode ? 'a test seat is never debited with live keys' : 'a real seat is never debited with test keys' }
  if (r.pending > 0) return { kind: 'wait', why: 'an attempt is not settled yet' }
  if (r.attempts > RETRY_DAYS.length) return { kind: 'wait', why: 'retries spent' }
  if (r.attempts > 0 && !s.failedAt) return { kind: 'wait', why: 'a retry without a recorded failure' }
  // When this attempt is due: the period's end first, then days 1, 3 and 5 after the first failure.
  const dueAt = r.attempts === 0 ? s.periodEnd.getTime() : s.failedAt!.getTime() + RETRY_DAYS[r.attempts - 1]! * DAY
  if (needsFreshNotice(r.noticeQueuedAt, r.lastFailedAt)) return t >= dueAt - lead ? { kind: 'notice', debitAt: new Date(Math.max(dueAt, t + lead)) } : { kind: 'wait', why: 'notice not due' }
  if (!r.noticeSentAt) return { kind: 'wait', why: 'the notice is not sent yet' }
  if (!noticeStood(r.noticeSentAt, now, lead) || t < dueAt) return { kind: 'wait', why: 'the notice must stand its lead' }
  return { kind: 'debit', attempt: r.attempts + 1 }
}
