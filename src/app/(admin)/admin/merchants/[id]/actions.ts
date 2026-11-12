'use server'

import { z } from 'zod'
import { openOwnerInvite } from '@/lib/admin/merchants'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { sendSignInLink } from '@/lib/auth/send-link'
import type { ActionResult } from '@/components/ui/action-form'

export async function resendOwnerLinkAction(form: FormData): Promise<ActionResult> {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return { error: staff.message }
  const id = z.uuid().safeParse(form.get('tenantId'))
  if (!id.success) return { error: 'That form was incomplete. Nothing was changed.' }
  const invite = await openOwnerInvite(staff, id.data)
  if (!invite) return { error: 'The owner has already signed in.' }
  const r = await sendSignInLink(invite.email)
  return r.sent ? { ok: `Sign-in link sent to ${invite.email}.` } : { error: r.error }
}
