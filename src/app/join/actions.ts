'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireUser } from '@/lib/auth/require-user'
import { acceptPartnerInvite } from '@/lib/db/partners'
import type { ActionResult } from '@/components/ui/action-form'

// Join a partner's team (T1a). The member id comes from the form, but app_partner_accept accepts only an invite to THIS
// person's confirmed email, unexpired, from a live partner, and never for someone already in a partner or with their own
// application. A refusal goes back to the form as a toast (frata-design-language § Feedback).

const SENTENCES: Record<string, string> = {
  email_unconfirmed: 'Confirm your email first: use the link or code we sent.',
  no_invite: 'This invite has ended. Ask the partner to send it again.',
  bad_role: 'This invite can’t be accepted yet. Ask the partner to send it again.',
  in_team: 'You’re already in a partner’s team. Ask them to remove you first.',
  own_partner: 'You have your own partner account. Use another email to join this team.',
}

export async function acceptTeamInviteAction(form: FormData): Promise<ActionResult> {
  const auth = await requireUser()
  if (!auth.ok) redirect('/login')
  const id = z.uuid().safeParse(form.get('memberId'))
  if (!id.success) return { error: SENTENCES.no_invite }
  const r = await acceptPartnerInvite(auth.userId, id.data)
  if (!r.ok) return { error: SENTENCES[r.error] ?? 'We could not join the team. Nothing was changed.' }
  return r.skipped.length
    ? { ok: `Joined. You already work on ${r.skipped.join(', ')}, so it stays as it is.`, go: '/partner' }
    : { ok: 'Joined the team.', go: '/partner' }
}
