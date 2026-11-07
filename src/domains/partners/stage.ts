// =============================================================================
// FILE: src/domains/partners/stage.ts — where a partner's client store is, and
// how long its share runs. Derived from timestamps, never stored (CLAUDE.md:
// derive, never duplicate). Pure: the Clients list and, later, the monthly
// statements read these two functions and nothing else.
// =============================================================================

export type ClientStage = 'building' | 'invited' | 'with_owner' | 'open' | 'ended'

export type ClientFacts = {
  removedAt: Date | null
  /** An owner invite that is not accepted, revoked or expired. */
  openInviteExpiresAt: Date | null
  hasOwner: boolean
  /** The shop's FIRST opening (partner_links.share_starts_at). */
  firstOpenedAt: Date | null
}

export function clientStage(f: ClientFacts, now: Date): ClientStage {
  if (f.removedAt) return 'ended'
  if (f.firstOpenedAt) return 'open'
  if (f.hasOwner) return 'with_owner'
  if (f.openInviteExpiresAt && f.openInviteExpiresAt > now) return 'invited'
  return 'building'
}

export const STAGE_LABEL: Record<ClientStage, string> = {
  building: 'Building', invited: 'Invite sent', with_owner: 'With the owner', open: 'Open', ended: 'Removed',
}

export type ShareTerms = { shareMonths: number; noticeDays: number }

/** Adds whole months in UTC; the 31st rolls to the month's last day, never into the next month. */
export function addMonths(d: Date, months: number): Date {
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + months
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), last), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()))
}

/**
 * The share's window: from the shop's first opening, for `shareMonths`; a removal ends it `noticeDays` later, never
 * after the months run out. 'not_started' until the shop opens; a store removed before it opened never starts.
 */
export function shareWindow(t: ShareTerms, firstOpenedAt: Date | null, removedAt: Date | null):
  { startsAt: Date; endsAt: Date } | 'not_started' {
  if (!firstOpenedAt || (removedAt && removedAt < firstOpenedAt)) return 'not_started'
  const full = addMonths(firstOpenedAt, t.shareMonths)
  const notice = removedAt ? new Date(removedAt.getTime() + t.noticeDays * 86_400_000) : null
  return { startsAt: firstOpenedAt, endsAt: notice && notice < full ? notice : full }
}
