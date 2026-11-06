'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { fromRupees } from '@/domains/money/paise'
import { FEATURES, PLAN_CODES } from '@/domains/plans/entitlements'
import { newPlanVersion } from '@/lib/admin/plans'
import { ADMIN_ONLY, requireStaff } from '@/lib/auth/require-staff'

const NewVersion = z.object({
  code: z.enum(PLAN_CODES),
  monthlyPrice: z.coerce.number().min(0).max(10_00_000),
  includedOrders: z.coerce.number().int().min(0).max(10_00_000),
  feePercent: z.coerce.number().min(0).max(20),
})

export async function newVersionAction(form: FormData) {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) redirect('/admin/plans')
  const p = NewVersion.safeParse(Object.fromEntries(form))
  const code = String(form.get('code'))
  if (!p.success) redirect(`/admin/plans/${code}?error=${encodeURIComponent('Check the price, orders and fee')}`)
  const features = FEATURES.filter((f) => form.get(`feature_${f}`) === 'on')
  const v = await newPlanVersion(staff, p.data.code, {
    monthlyPrice: fromRupees(p.data.monthlyPrice),
    includedOrders: p.data.includedOrders,
    feeBps: Math.round(p.data.feePercent * 100),
    features,
  })
  redirect(`/admin/plans?ok=${encodeURIComponent(`Saved as version ${v.version}. Stores on older versions keep theirs.`)}`)
}
