'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { monthOfYM } from '@/domains/time/month'
import { runDraftsNow } from '@/lib/admin/billing'
import { draftableMonths } from '@/lib/billing/run'
import { ADMIN_ONLY, requireStaff } from '@/lib/auth/require-staff'

const Month = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) })

export async function runDraftsAction(form: FormData) {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) redirect('/admin/billing')
  const p = Month.safeParse(Object.fromEntries(form))
  if (!p.success) redirect(`/admin/billing?error=${encodeURIComponent('Choose a month')}`)
  const month = monthOfYM(p.data.month)!
  // Only this month (until issued) and next: a draft for any other month would claim orders the real one should bill.
  if (!draftableMonths(new Date()).some((m) => m.getTime() === month.getTime())) redirect(`/admin/billing?month=${p.data.month}&error=${encodeURIComponent('Drafts are made for this month and next only.')}`)
  const r = await runDraftsNow(staff, month)
  revalidatePath('/admin/billing')
  const msg = `${r.drafted} drafted${r.issued ? `, ${r.issued} already issued` : ''}${r.failed ? `, ${r.failed} failed (see the logs)` : ''}${r.skipped ? `, ${r.skipped} not reached` : ''}.`
  redirect(`/admin/billing?month=${p.data.month}&${r.failed ? 'error' : 'ok'}=${encodeURIComponent(msg)}`)
}
