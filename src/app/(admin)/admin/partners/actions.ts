'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { decidePartner } from '@/lib/admin/partners'
import { ADMIN_ONLY, requireStaff } from '@/lib/auth/require-staff'
import { sendSignInLink } from '@/lib/auth/send-link'

const Decide = z.object({ id: z.uuid(), decision: z.enum(['approve', 'decline']), reason: z.string().trim().max(300).optional() })

export async function decidePartnerAction(form: FormData) {
  // Approving lets someone make stores: Frata admins only, as plans are (impact review 2026-11-07).
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) redirect('/admin/partners?error=' + encodeURIComponent('Only a Frata admin can decide an application.'))
  const p = Decide.safeParse(Object.fromEntries(form))
  if (!p.success) redirect('/admin/partners?error=' + encodeURIComponent('Choose approve or decline.'))
  if (p.data.decision === 'decline' && !p.data.reason) redirect(`/admin/partners?id=${p.data.id}&error=${encodeURIComponent('Give a reason to decline.')}`)
  const r = await decidePartner(staff, p.data.id, p.data.decision === 'approve' ? { approve: true } : { approve: false, reason: p.data.reason! })
  if (!r.ok) redirect(`/admin/partners?error=${encodeURIComponent(r.error)}`)
  // Approved: their usual sign-in email, which opens the workspace. The approval stands without it.
  const mail = p.data.decision === 'approve' ? await sendSignInLink(r.email).catch(() => ({ sent: false as const })) : null
  revalidatePath('/admin/partners')
  const said = !mail ? 'Declined.' : mail.sent ? `Approved. Sign-in link sent to ${r.email}.` : `Approved. The sign-in email did not send: ${r.email} can sign in at /login.`
  redirect(`/admin/partners?ok=${encodeURIComponent(said)}`)
}
