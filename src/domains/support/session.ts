// =============================================================================
// FILE: src/domains/support/session.ts
//
// A SUPPORT SESSION: a staff member inside one merchant's console, for a stated
// reason, for a fixed time. The database enforces expiry on every request
// (app_memberships_for); these are the same rules for the UI and the tests.
// =============================================================================

export const SUPPORT_LENGTHS_MIN = [30, 60, 240] as const
export type SupportLength = (typeof SUPPORT_LENGTHS_MIN)[number]
export const DEFAULT_SUPPORT_MIN: SupportLength = 60

export const SUPPORT_REASONS = ['setup_help', 'fix_problem', 'merchant_asked'] as const
export type SupportReason = (typeof SUPPORT_REASONS)[number]
export const SUPPORT_REASON_LABEL: Record<SupportReason, string> = {
  setup_help: 'Setup help',
  fix_problem: 'Fix a problem',
  merchant_asked: 'The merchant asked',
}

export type SessionTimes = { expiresAt: Date; endedAt: Date | null }

export function isActive(s: SessionTimes, now: Date): boolean {
  return s.endedAt === null && s.expiresAt.getTime() > now.getTime()
}

/** Whole minutes left, never negative; 0 once it is over. */
export function minutesLeft(s: SessionTimes, now: Date): number {
  if (!isActive(s, now)) return 0
  return Math.ceil((s.expiresAt.getTime() - now.getTime()) / 60_000)
}

export function expiresAt(start: Date, minutes: SupportLength): Date {
  return new Date(start.getTime() + minutes * 60_000)
}
