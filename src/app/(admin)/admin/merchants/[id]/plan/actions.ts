'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { fromRupees } from '@/domains/money/paise'
import { PLAN_CODES } from '@/domains/plans/entitlements'
import { nextMonthStartIST } from '@/domains/time/month'
import { changeTenantPlan } from '@/lib/admin/plans'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { errName } from '@/lib/log'

const Change = z.object({
  tenantId: z.uuid(),
  code: z.enum(PLAN_CODES),
  when: z.enum(['now', 'next_month']),
  trialEndsAt: z.string().optional().transform((v) => (v ? new Date(`${v}T23:59:59+05:30`) : null)),
  customPrice: z.string().optional().transform((v) => (v && v.trim() ? Number(v.replace(/[₹,\s]/g, '')) : null)).refine((v) => v === null || (Number.isFinite(v) && v >= 0), 'price'),
  reason: z.string().trim().max(200).optional().transform((v) => v || null),
})

export async function changePlanAction(form: FormData) {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) redirect('/admin')
  const p = Change.safeParse(Object.fromEntries(form))
  const id = String(form.get('tenantId'))
  if (!p.success) redirect(`/admin/merchants/${id}/plan?error=${encodeURIComponent('Check the plan and the custom price')}`)
  if (p.data.customPrice !== null && !p.data.reason) redirect(`/admin/merchants/${id}/plan?error=${encodeURIComponent('A custom price needs a reason')}`)
  const now = new Date()
  try {
    await changeTenantPlan(staff, p.data.tenantId, {
      code: p.data.code,
      startsAt: p.data.when === 'now' ? now : nextMonthStartIST(now),
      trialEndsAt: p.data.trialEndsAt,
      customMonthlyPrice: p.data.customPrice === null ? null : fromRupees(p.data.customPrice),
      reason: p.data.reason,
    })
  } catch (err) {
    console.error('[changePlanAction]', errName(err))
    redirect(`/admin/merchants/${id}/plan?error=${encodeURIComponent('We could not change the plan. Nothing was saved.')}`)
  }
  redirect(`/admin/merchants/${id}?ok=${encodeURIComponent('Plan changed.')}`)
}
