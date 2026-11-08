// =============================================================================
// FILE: src/domains/plans/trial.ts — FREE TRIALS ON PLANS, THE RULES (trials TR0; spec docs/specs/2026-11-08-trials.md,
// plan docs/plans/2026-11-08-trials.md). Pure: every date in, every answer out; nothing here is stored.
//
// Owner, 2026-11-08: only the plan's monthly price is free in a trial (fees and add-ons are charged as usual); the
// trial begins once the website is live (first publish), for every shop; its length is Admin's setting (7–45 days for
// new sign-ups, default 30; up to 90 for one shop, by staff); a shop has `openWindowDays` (0–30, default 15) to go
// live before its clock starts anyway; one 7-day extension, ever; 7 days of grace after the end, then paused unless
// autopay is set up; fees owed in a trial past ₹2,000 before GST without autopay start the grace early.
// Every end is the END OF AN IST DAY: stored as the first moment of the next IST day (exclusive).
// The SQL twin of `trialEndsAt` lives in the recompute definer; a parity test holds them together (plan § A1).
// =============================================================================
import { istDayStart } from '@/domains/time/day'

const DAY = 86_400_000
export const SIGNUP_DAYS = { min: 7, max: 45, default: 30 } as const
export const SHOP_DAYS = { min: 7, max: 90 } as const
export const OPEN_WINDOW_DAYS = { min: 0, max: 30, default: 15 } as const
export const EXTENSION_DAYS = 7
export const GRACE_DAYS = 7
/** The banner's "ending" window. */
export const ENDING_DAYS = 10
/** Fees owed in a trial (paise, before GST) past which autopay is asked for and the grace starts early. */
export const FEE_EXPOSURE_PAISE = 2_000_00
/** The owner's extension is offered only to a shop that has not yet seen this many delivered orders. */
export const EXTEND_BELOW_DELIVERED = 3

export type TrialTerms = { days: number; openWindowDays: number }

/** Admin's terms, checked: `perShop` allows up to 90 days (staff, one shop); sign-ups up to 45. */
export function checkTerms(t: TrialTerms, perShop = false): { ok: true } | { ok: false; error: string } {
  const r = perShop ? SHOP_DAYS : SIGNUP_DAYS
  if (!Number.isInteger(t.days) || t.days < r.min || t.days > r.max) return { ok: false, error: `The trial is ${r.min} to ${r.max} days.` }
  if (!Number.isInteger(t.openWindowDays) || t.openWindowDays < OPEN_WINDOW_DAYS.min || t.openWindowDays > OPEN_WINDOW_DAYS.max)
    return { ok: false, error: `Days to go live are ${OPEN_WINDOW_DAYS.min} to ${OPEN_WINDOW_DAYS.max}.` }
  return { ok: true }
}

/** The end of the IST day that falls `days` days after `from` (exclusive: the first moment of the next IST day). */
export function endOfIstDayAfter(from: Date, days: number): Date {
  return istDayStart(new Date(from.getTime() + days * DAY), 1)
}

export type TrialFacts = TrialTerms & {
  signedUpAt: Date
  /** The first time the website went live; null while building. Set once, never reset. */
  startedAt: Date | null
  /** The one extension, when taken. */
  extendedAt: Date | null
  /** Staff ended the trial early (the end is then this moment, no grace beyond what the state says). */
  endedAt: Date | null
}

/**
 * THE trial end (exclusive). Building: provisional — sign-up + window + length (the clock starts then anyway). Live:
 * the earlier of start + length and that cap. Plus 7 days once extended. Staff's end-now wins when earlier.
 */
export function trialEndsAt(f: TrialFacts): Date {
  const cap = endOfIstDayAfter(f.signedUpAt, f.openWindowDays + f.days)
  let end = f.startedAt ? new Date(Math.min(endOfIstDayAfter(f.startedAt, f.days).getTime(), cap.getTime())) : cap
  if (f.extendedAt) end = new Date(end.getTime() + EXTENSION_DAYS * DAY)
  if (f.endedAt && f.endedAt < end) end = f.endedAt
  return end
}

export type TrialState = 'building' | 'trial' | 'ending' | 'grace' | 'paused' | 'paid'

export type TrialMoney = {
  /** Autopay set up and not revoked. */
  mandateActive: boolean
  /** When the fees owed in the trial first passed FEE_EXPOSURE_PAISE without autopay (from the invoices); null if never. */
  exposedAt: Date | null
}

/** When the 7-day grace begins: the trial end, or earlier once the fee exposure was passed without autopay. */
export function graceStartsAt(endsAt: Date, m: TrialMoney): Date {
  return !m.mandateActive && m.exposedAt && m.exposedAt < endsAt ? m.exposedAt : endsAt
}

/** When the shop pauses (stops taking new orders) unless autopay is set up first. */
export function pausesAt(endsAt: Date, m: TrialMoney): Date {
  return new Date(graceStartsAt(endsAt, m).getTime() + GRACE_DAYS * DAY)
}

/**
 * The state, derived (never stored). With autopay the trial ends into the paid plan; without it, grace, then paused.
 * A shop still building whose window has run out is simply in its trial (its clock started anyway).
 */
export function trialState(now: Date, f: TrialFacts, m: TrialMoney): TrialState {
  const endsAt = trialEndsAt(f)
  const graceFrom = graceStartsAt(endsAt, m)
  if (m.mandateActive && now >= endsAt) return 'paid'
  if (!m.mandateActive && now >= pausesAt(endsAt, m)) return 'paused'
  if (!m.mandateActive && now >= graceFrom) return 'grace'
  if (now >= endsAt) return 'paid' // unreachable without a mandate; kept total
  if (!f.startedAt && now < endOfIstDayAfter(f.signedUpAt, f.openWindowDays)) return 'building'
  return endsAt.getTime() - now.getTime() <= ENDING_DAYS * DAY ? 'ending' : 'trial'
}

/** Whole days left until `at`, counting a part day as a day; 0 once passed. */
export function daysUntil(now: Date, at: Date): number {
  return Math.max(0, Math.ceil((at.getTime() - now.getTime()) / DAY))
}

/** The date a person reads as "ends on": the last IST day of the trial (the day before the exclusive end). */
export function lastDay(endsAt: Date): Date {
  return new Date(endsAt.getTime() - 1)
}

/** The owner's one extension: not taken before, fewer than 3 delivered orders, in the last 10 days or the grace after. */
export function mayExtend(now: Date, f: TrialFacts, delivered: number, m: TrialMoney): boolean {
  if (f.extendedAt || f.endedAt) return false
  const s = trialState(now, f, m)
  // As app_trial_extend (0063): only from 10 days before the end to the end of the 7-day grace after it — an early
  // grace (fees past ₹2,000) does not open it sooner.
  const e = trialEndsAt(f).getTime(), t = now.getTime()
  return (s === 'ending' || s === 'grace') && delivered < EXTEND_BELOW_DELIVERED && t >= e - ENDING_DAYS * DAY && t < e + GRACE_DAYS * DAY
}

/** A partner's shop handed over with under 7 trial days left gets the one extension automatically (owner, 2026-11-08). */
export function extendsAtHandover(now: Date, f: TrialFacts): boolean {
  return !f.extendedAt && !f.endedAt && trialEndsAt(f).getTime() - now.getTime() < EXTENSION_DAYS * DAY
}

/**
 * The days a shop is paused for billing (no plan charge accrues; owner 2026-11-08): from its pause until autopay
 * reopened it, or still running. Null when autopay was set up before the pause. A mandate revoked after the pause date
 * pauses the shop 7 days (GRACE_DAYS) after the revocation. `exposedAt`: as TrialMoney.
 */
export function pauseWindow(f: TrialFacts, mandateAt: Date | null, revokedAt: Date | null, exposedAt: Date | null = null): { from: Date; to: Date | null } | null {
  const at = pausesAt(trialEndsAt(f), { mandateActive: false, exposedAt })
  const active = !!mandateAt && !revokedAt
  if (active && mandateAt! <= at) return null
  if (active) return { from: at, to: mandateAt }
  // A mandate revoked after the pause date: the same 7-day grace from the revocation, then the pause (impact review TR1).
  const late = revokedAt && revokedAt > at ? autopayStoppedPause(revokedAt) : null
  return late ?? { from: at, to: null }
}

/**
 * Any shop, trial or not (owner, 2026-11-08: both are treated the same): autopay stopped pauses the shop 7 days
 * (GRACE_DAYS) after it stopped, until autopay is set up again. Null while autopay runs or was never set up.
 */
export function autopayStoppedPause(revokedAt: Date | null): { from: Date; to: null } | null {
  return revokedAt ? { from: new Date(revokedAt.getTime() + GRACE_DAYS * DAY), to: null } : null
}
