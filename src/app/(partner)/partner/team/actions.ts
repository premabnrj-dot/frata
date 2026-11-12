'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requirePartner } from '@/lib/auth/require-partner'
import { assignPartnerPerson, invitePartnerPerson, removePartnerPerson } from '@/lib/db/partners'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'
import type { ActionResult } from '@/components/ui/action-form'
import { MAX_PARTNER_PEOPLE, partnerCan } from '@/domains/partners/team'

// =============================================================================
// FILE: src/app/(partner)/partner/team/actions.ts — the partner's team (T1a). Who may: the partner's OWNER only, and
// that is checked twice: requirePartner's role here for the words, and inside every app_partner_* definer, which
// refuses anyone else whatever this file says. Store ids come from the form; the definers accept only the partner's own
// active links. No result travels in a URL (frata-design-language § Feedback).
// =============================================================================

const SENTENCES = {
  not_owner: 'Only the partner’s owner manages the team.',
  bad_role: 'Invite them as a Lead.',
  bad_email: 'That email doesn’t look right.',
  bad_store: 'One of those stores isn’t yours any more. Refresh and try again.',
  too_many: `A team has at most ${MAX_PARTNER_PEOPLE} people, invited or joined.`,
  already_invited: 'That email is already in your team or invited.',
  no_person: 'That person isn’t in your team any more. Refresh and try again.',
  already_member: 'They already work on that store in another way (the brand’s own people). Ask the brand.',
  is_owner: 'The owner can’t be removed.',
} satisfies Record<string, string>
const say = (code: string, fallback: string): string => (SENTENCES as Record<string, string | undefined>)[code] ?? fallback

const Invite = z.object({
  email: z.string().trim().toLowerCase().min(3).max(200).regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/),
  stores: z.array(z.uuid()).max(200),
})

export async function inviteTeamAction(form: FormData): Promise<ActionResult> {
  const auth = await requirePartner()
  if (!auth.ok) return { error: auth.message }
  if (!partnerCan(auth.partner.memberRole, 'manageTeam')) return { error: SENTENCES.not_owner }
  const parsed = Invite.safeParse({ email: form.get('email'), stores: [...new Set(form.getAll('stores').map(String))] })
  if (!parsed.success) {
    const emailBad = parsed.error.issues.some((i) => i.path[0] === 'email')
    return emailBad ? { fields: { email: String(form.get('email') ?? '').trim() ? 'That email doesn’t look right' : 'Enter their work email' } } : { error: SENTENCES.bad_store }
  }
  if (!(await withinLimit(LIMITS.partnerInvite, auth.partner.memberId, new Date(), true))) return { error: 'Too many invites this hour. Try again later.' }
  const r = await invitePartnerPerson(auth.userId, parsed.data.email, parsed.data.stores)
  if (!r.ok) return r.error === 'bad_email' ? { fields: { email: SENTENCES.bad_email } } : { error: say(r.error, 'We could not send the invite. Nothing was changed.') }
  revalidatePath('/partner/team')
  return { ok: `Invited ${parsed.data.email}. They sign in with that email to join.` }
}

const Assign = z.object({ memberId: z.uuid(), tenantId: z.uuid(), on: z.boolean() })

export async function assignTeamAction(input: { memberId: string; tenantId: string; on: boolean }): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requirePartner()
  if (!auth.ok) return { ok: false, error: auth.message }
  const p = Assign.safeParse(input)
  if (!p.success) return { ok: false, error: SENTENCES.no_person }
  const r = await assignPartnerPerson(auth.userId, p.data.memberId, p.data.tenantId, p.data.on)
  if (!r.ok) return { ok: false, error: say(r.error, 'We could not change their stores. Nothing was changed.') }
  revalidatePath('/partner/team')
  return { ok: true }
}

export async function removeTeamAction(input: { memberId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requirePartner()
  if (!auth.ok) return { ok: false, error: auth.message }
  const p = z.uuid().safeParse(input.memberId)
  if (!p.success) return { ok: false, error: SENTENCES.no_person }
  const r = await removePartnerPerson(auth.userId, p.data)
  if (!r.ok) return { ok: false, error: say(r.error, 'We could not remove them. Nothing was changed.') }
  revalidatePath('/partner/team')
  return { ok: true }
}
