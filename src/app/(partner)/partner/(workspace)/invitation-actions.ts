'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requirePartner } from '@/lib/auth/require-partner'
import { answerPartnerRequest } from '@/lib/db/people'
import { refreshKeys } from '@/lib/queries/storefront-api'
import { partnerCan } from '@/domains/partners/team'
import { CONFIRM_AGAIN, CONFIRM_FIRST } from '@/domains/partners/passkeys'

// A store's invitation to be its partner (docs/specs/2026-11-23-add-partner.md). Only the partner owner answers
// (PARTNER_CAN.billing is the owner's); the definer re-checks the owner, the step-up, and that the invitation was sent
// to the caller's own confirmed email. The id comes from the form; any other id reads as "no_request".

const SENTENCES: Record<string, string> = {
  not_partner: 'Only the partner owner can answer this.',
  no_request: 'This invitation has ended.',
  has_partner: 'This store has a partner now.',
  no_owner: 'The person who invited you is no longer the store’s owner.',
  already_member: 'Someone on your team already works on this store. Ask the owner to remove them first.',
  confirm_first: CONFIRM_FIRST,
  confirm_again: CONFIRM_AGAIN,
}

export async function answerInvitationAction(id: string, yes: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requirePartner()
  if (!auth.ok) return { ok: false, error: auth.message }
  if (!partnerCan(auth.partner.memberRole, 'billing')) return { ok: false, error: SENTENCES.not_partner! }
  if (!z.uuid().safeParse(id).success || typeof yes !== 'boolean') return { ok: false, error: SENTENCES.no_request! }
  const r = await answerPartnerRequest(auth, id, yes)
  if (!r.ok) return { ok: false, error: SENTENCES[r.error] ?? 'We couldn’t answer it. Nothing was changed.' }
  // The partner's older keys on this store were deleted with the accept; their cached copies go now.
  if (r.tenantId) await refreshKeys(r.tenantId)
  revalidatePath('/partner')
  return { ok: true }
}
