'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { openOwnerInvite } from '@/lib/admin/merchants'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { sendSignInLink } from '@/lib/auth/send-link'

export async function resendOwnerLinkAction(form: FormData) {
  const staff = await requireStaff(ANY_STAFF)
  const id = z.uuid().safeParse(form.get('tenantId'))
  if (!staff.ok || !id.success) redirect('/admin/merchants')
  const invite = await openOwnerInvite(staff, id.data)
  if (!invite) redirect(`/admin/merchants/${id.data}?error=${encodeURIComponent('The owner has already signed in.')}`)
  const r = await sendSignInLink(invite!.email)
  redirect(`/admin/merchants/${id.data}?${r.sent ? `ok=${encodeURIComponent(`Sign-in link sent to ${invite!.email}.`)}` : `error=${encodeURIComponent(r.error)}`}`)
}
