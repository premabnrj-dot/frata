import 'server-only'
import { cache } from 'react'
import { requireUser } from './require-user'
import { accessOf, partnerProof, sessionIdOf } from './session'
import { myPartner, type MyPartner } from '@/lib/db/partners'
import { FRESH_MS } from './require-staff'

// =============================================================================
// FILE: src/lib/auth/require-partner.ts — THE FIRST LINE OF EVERY /partner PAGE
// AND ACTION. An APPROVED partner (approved_at set, not declined), read through
// app_my_partner(getUser().id): the caller's own team membership (owner or lead, T1a). Never throws. The workspace reads only the
// partner's own rows; a client store is opened through the store switcher,
// where requireMember decides as everywhere else.
//
// Partner passkeys (T1b; docs/specs/2026-11-15-partner-login.md): a live partner check on this browser session, read in
// the same app_access_for query every signed-in request runs. Without one the answer is `needs_passkey` with a
// PartnerIdentity — a different type, accepted only by src/lib/db/partner-passkeys.ts — and the workspace layout shows
// the check in place of any page. A PartnerOk carries the session and the step-up's hash: every app_partner_* definer
// re-checks them (app_partner_need), so a page or action cannot skip the check by not asking.
// =============================================================================

export type PartnerOk = {
  ok: true; userId: string; email: string; partner: MyPartner
  /** This browser's Supabase session and the step-up cookie's hash: passed to every workspace definer. */
  sessionId: string; stepup: string
  /** When this session's passkey check was made (a hand over, approving or removing wants it within 5 minutes). */
  confirmedAt: Date
}
/** Signed in, an approved and live partner person, no passkey check on this session yet: enough to run the check,
 *  nothing else. `sessionId` null: sign in again. */
export type PartnerIdentity = { readonly kind: 'partner-identity'; userId: string; email: string; partner: MyPartner; sessionId: string | null }

export type PartnerResult = PartnerOk
  | { ok: false; reason: 'not_configured' | 'signed_out' | 'not_partner' | 'in_review' | 'suspended'; message: string }
  | { ok: false; reason: 'needs_passkey'; message: string; identity: PartnerIdentity }

/** Within the last 5 minutes (the staff rule's FRESH_MS, one number): hand over, invite, approve, delete. */
export const confirmedRecently = (p: PartnerOk, now = Date.now()) => now - p.confirmedAt.getTime() < FRESH_MS

export const requirePartner = cache(async (): Promise<PartnerResult> => {
  const user = await requireUser()
  if (!user.ok) return { ok: false, reason: user.reason, message: user.message }
  const partner = await myPartner(user.userId).catch((err) => { console.error('[requirePartner]', err instanceof Error ? err.name : err); return null })
  if (!partner || partner.declinedAt) return { ok: false, reason: 'not_partner', message: 'This email is not a Frrata partner' }
  if (!partner.approvedAt) return { ok: false, reason: 'in_review', message: 'Your application is in review' }
  // Frrata paused this partner (Admin): the workspace says so; access to every store already ended in the database.
  if (partner.suspendedAt) return { ok: false, reason: 'suspended', message: 'Frrata has paused this partner account' }
  const [access, proof] = await Promise.all([accessOf(user.userId), partnerProof(user.userId)])
  // With the passkeys-off switch on (drizzle/0151, owner 2026-11-16) the database counts the check as made without a
  // step-up cookie: the session comes from sign-in and the hash is empty, and every app_partner_* definer re-reads the
  // same switch. Without the switch a missing cookie never yields partnerConfirmedAt, so this path stays closed.
  const sessionId = proof?.sessionId ?? (access.partnerConfirmedAt ? await sessionIdOf(user.userId) : null)
  if (!access.partnerConfirmedAt || !sessionId) {
    return { ok: false, reason: 'needs_passkey', message: 'Confirm it’s you',
      identity: { kind: 'partner-identity', userId: user.userId, email: user.email, partner, sessionId: await sessionIdOf(user.userId) } }
  }
  return { ok: true, userId: user.userId, email: user.email, partner, sessionId, stepup: proof?.hash ?? '', confirmedAt: new Date(access.partnerConfirmedAt) }
})
