'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { TENANT_COOKIE } from '@/lib/auth/require-member'
import { requireUser } from '@/lib/auth/require-user'
import { acceptHandover } from '@/lib/db/partners'

// Accept a store a partner built. The invite id comes from the form, but app_accept_handover accepts only an
// invite to THIS person's confirmed email, on a store with no owner, and never by its own partner.

const SENTENCES: Record<string, string> = {
  email_unconfirmed: 'Confirm your email first: use the link or code we sent.',
  no_invite: 'This invite has ended. Ask your partner to send it again.',
  has_owner: 'This store already has its owner.',
  already_member: 'You already work on this store. Ask your partner to invite another email.',
}

export async function acceptHandoverAction(form: FormData) {
  const auth = await requireUser()
  if (!auth.ok) redirect('/login')
  const id = z.uuid().safeParse(form.get('inviteId'))
  if (!id.success) redirect('/handover')
  const r = await acceptHandover(auth.userId, id.data)
  if (!r.ok) redirect(`/handover?error=${encodeURIComponent(SENTENCES[r.error] ?? 'We could not accept the store. Nothing was changed.')}`)
  ;(await cookies()).set(TENANT_COOKIE, r.tenantId, { httpOnly: true, sameSite: 'lax', path: '/', secure: process.env.NODE_ENV === 'production' })
  redirect('/console')
}
