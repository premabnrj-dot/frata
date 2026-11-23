// =============================================================================
// FILE: src/domains/studio/spend.ts — STUDIO'S HARD SPEND CAP WHILE NO CREDITS EXIST (plan
// docs/plans/2026-11-22-v3a-runtime.md § Spend cap; reviews: unit economics F1–F9, security M2/L3, architecture 4).
// List cost only, in integer micro-dollars (`MicroUsd`, src/domains/money/usd.ts); cents only where Anthropic's budget
// takes them (`toCents`). Everything here fails closed: a model with no caps row has no caps, so no turn starts.
//
//   turn ceiling   the session's budget is raised before each send to: spent so far + ceiling − max(largest request,
//                  floor), so the request that crosses it lands inside the ceiling (spec § 6.7). Anthropic pauses the
//                  session at it. If the largest request reaches the ceiling, the session restarts (F8).
//   per person, per India day; platform, per India day; open sessions: checked at Send against reserved + measured.
//   settle         records the MEASURED delta, uncapped (F3): an overshoot of one request is counted as it was.
//
// Haiku 5.5's arithmetic (list, claude-api skill, cached 2026-11-03; spec § 8's page profile, 5k uncached a turn):
// $0.10 in / $0.50 out per million up to 100K prompt tokens, $0.50 / $2.50 above; cache read 0.1×, 5-minute write
// 1.25×; running time $0.08 an hour. A page turn ≈ $0.038 below 100K, $0.190 above, + $0.008 running time (each request
// in that profile is 87.4k tokens, so a session crosses 100K). The ceiling $0.50 holds a page turn at the higher rate;
// the floor $0.12 covers one cold request above 100K (100–150k written, 5–8k out: $0.075–0.114). $25 ≈ 100–500 turns.
// These figures price nothing: credits come from the proof on spec § 7's model, which brings its own row.
// =============================================================================

import { microUsd, type MicroUsd } from '@/domains/money/usd'
import { STUDIO_MODEL } from './model'

/** List rates per million tokens, at the model's HIGHER tier (prompts over 100K): a request is never under-priced. */
export type Rates = { in: number; out: number; read: number; write: number }

export type Caps = {
  rates: Rates
  /** A turn's default ceiling and the most a turn may ask for. */
  turnCeiling: MicroUsd; turnMax: MicroUsd
  /** The least the "largest request so far" counts as (one cold request at the model's higher rate). */
  floor: MicroUsd
  /** Per person per India day; platform per India day. */
  personDay: MicroUsd; platformDay: MicroUsd
  /** Sessions open at once, platform-wide. */
  openSessions: number
}

/** One row per model Studio may run. A model without a row has no caps: every turn refuses (check:studio). */
export const CAPS: Readonly<Record<string, Caps>> = {
  [STUDIO_MODEL]: {
    // Haiku 5.5 above 100K: $0.50 in, $2.50 out; cache read 0.1×; a cache write priced as a 1-hour write (2×).
    rates: { in: 0.5, out: 2.5, read: 0.05, write: 1.0 },
    turnCeiling: microUsd(0.5), turnMax: microUsd(1), floor: microUsd(0.12),
    personDay: microUsd(3), platformDay: microUsd(10), openSessions: 3,
  },
}

/** The database's hard ceilings (drizzle/0167 app_studio_open_turn refuses any cap above them; a test reads the SQL):
 *  sized to the spec's C1 budgets at ₹94 and 1.10 (unit economics review of the phase, F1): a turn of 120 credits
 *  ($7.35), a person's 300 credits ($18.37) under $50, the platform's ₹25,000 day ($265.96), 70 sessions (decision 29). */
export const HARD = { turn: microUsd(7.5), personDay: microUsd(50), platformDay: microUsd(270), openSessions: 70 } as const

export const capsFor = (model: string): Caps | null => CAPS[model] ?? null
export const studioCaps = (): Caps | null => capsFor(STUDIO_MODEL)

/** Micro-dollars to whole cents, rounded down (a budget never rounds up past the ceiling). */
export const toCents = (m: MicroUsd): number => Math.floor(m / 10_000)
/** Anthropic's `{amount: "123", currency: "USD"}` (cents, a string) to micro-dollars; anything else is 0. */
export const fromCents = (amount: string | number | null | undefined): MicroUsd => {
  const n = typeof amount === 'string' ? Number(amount) : amount ?? 0
  return (Number.isFinite(n) && n > 0 ? Math.round(n) * 10_000 : 0) as MicroUsd
}

export type BudgetAnswer = { ok: true; cents: number } | { ok: false; why: 'restart' }

/**
 * The session budget to set before a turn's send (spec § 6.7's formula). `spent` is the session's measured list cost so
 * far, `largest` the largest single request seen in it. A budget must be strictly above what is spent (Anthropic refuses
 * otherwise), so when the margin is gone the session restarts instead (F8).
 */
export function budgetFor(a: { spent: MicroUsd; largest: MicroUsd; ceiling: MicroUsd; floor: MicroUsd }): BudgetAnswer {
  const margin = Math.max(a.largest, a.floor)
  if (margin >= a.ceiling) return { ok: false, why: 'restart' }
  const cents = toCents((a.spent + a.ceiling - margin) as MicroUsd)
  // Strictly above the spent amount in whole cents, and at least one cent of new work.
  return cents > Math.ceil(a.spent / 10_000) ? { ok: true, cents } : { ok: false, why: 'restart' }
}

/** A turn's ceiling as asked (null: the default), clamped to the model's maximum. */
export const ceilingOf = (caps: Caps, asked?: MicroUsd | null): MicroUsd =>
  (asked && asked > 0 ? Math.min(asked, caps.turnMax) : caps.turnCeiling) as MicroUsd

/** The delta a turn cost, from the session's cumulative list cost before and after (whole cents; never negative). */
export const deltaOf = (before: MicroUsd, after: MicroUsd): MicroUsd => Math.max(0, after - before) as MicroUsd

export type RequestTokens = { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }

/** One model request's list cost from its tokens (the budget formula's "largest request"), at the higher tier. */
export function requestCost(t: RequestTokens, r: Rates): MicroUsd {
  const n = (x: number) => (Number.isFinite(x) && x > 0 ? x : 0)
  // tokens × $ per million = micro-dollars
  return Math.ceil(n(t.input_tokens) * r.in + n(t.output_tokens) * r.out + n(t.cache_read_input_tokens) * r.read + n(t.cache_creation_input_tokens) * r.write) as MicroUsd
}
