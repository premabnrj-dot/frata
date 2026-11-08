'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { setTrialTerms, trialError } from '@/lib/admin/trials'
import { ADMIN_ONLY, requireStaff } from '@/lib/auth/require-staff'
import { errName } from '@/lib/log'

// Admin › Plans › Free trials (trials TR0·4): the terms for NEW sign-ups. ADMIN_ONLY; the definer checks again,
// requires the reason and audits it. A running trial keeps the terms it started with.
const Terms = z.object({ days: z.coerce.number().int().min(7).max(45), openWindowDays: z.coerce.number().int().min(0).max(30), reason: z.string().trim().min(3).max(240) })

export async function setTrialTermsAction(form: FormData) {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) redirect('/admin/plans')
  const p = Terms.safeParse(Object.fromEntries(form))
  if (!p.success) redirect(`/admin/plans?error=${encodeURIComponent('A sign-up trial is 7 to 45 days, 0 to 30 days to go live, and a reason.')}#trials`)
  try { await setTrialTerms(staff, p.data) } catch (e) {
    console.error('[trial.settings]', errName(e))
    redirect(`/admin/plans?error=${encodeURIComponent(trialError(e))}#trials`)
  }
  revalidatePath('/admin/plans')
  redirect(`/admin/plans?ok=${encodeURIComponent(`New sign-ups get ${p.data.days} days from going live.`)}#trials`)
}
