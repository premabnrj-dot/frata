import 'server-only'
import { cache } from 'react'
import { requireUser } from './require-user'
import { myPartner, type MyPartner } from '@/lib/db/partners'

// =============================================================================
// FILE: src/lib/auth/require-partner.ts — THE FIRST LINE OF EVERY /partner PAGE
// AND ACTION. An APPROVED partner (approved_at set, not declined), read through
// app_my_partner(getUser().id): the caller's own team membership (owner or lead, T1a). Never throws. The workspace reads only the
// partner's own rows; a client store is opened through the store switcher,
// where requireMember decides as everywhere else.
// =============================================================================

export type PartnerResult =
  | { ok: true; userId: string; email: string; partner: MyPartner }
  | { ok: false; reason: 'not_configured' | 'signed_out' | 'not_partner' | 'in_review' | 'suspended'; message: string }

export const requirePartner = cache(async (): Promise<PartnerResult> => {
  const user = await requireUser()
  if (!user.ok) return { ok: false, reason: user.reason, message: user.message }
  const partner = await myPartner(user.userId).catch((err) => { console.error('[requirePartner]', err instanceof Error ? err.name : err); return null })
  if (!partner || partner.declinedAt) return { ok: false, reason: 'not_partner', message: 'This email is not a Frrata partner' }
  if (!partner.approvedAt) return { ok: false, reason: 'in_review', message: 'Your application is in review' }
  // Frrata paused this partner (Admin): the workspace says so; access to every store already ended in the database.
  if (partner.suspendedAt) return { ok: false, reason: 'suspended', message: 'Frrata has paused this partner account' }
  return { ok: true, userId: user.userId, email: user.email, partner }
})
