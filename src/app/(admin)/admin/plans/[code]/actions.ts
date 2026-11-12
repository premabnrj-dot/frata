'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { fromRupees } from '@/domains/money/paise'
import { PLAN_CODES } from '@/domains/plans/entitlements'
import { PLAN_GRANTABLE as FEATURES } from '@/domains/modules/registry'
import { newPlanVersion } from '@/lib/admin/plans'
import { ADMIN_ONLY, requireStaff } from '@/lib/auth/require-staff'
import type { ActionResult } from '@/components/ui/action-form'

const NewVersion = z.object({
  code: z.enum(PLAN_CODES),
  monthlyPrice: z.coerce.number().min(0).max(10_00_000),
  includedOrders: z.coerce.number().int().min(0).max(10_00_000),
  feePercent: z.coerce.number().min(0).max(20),
})

export async function newVersionAction(form: FormData): Promise<ActionResult> {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return { error: staff.message }
  const p = NewVersion.safeParse(Object.fromEntries(form))
  if (!p.success) return { error: 'Check the price, orders and fee.' }
  const features = FEATURES.filter((f) => form.get(`feature_${f}`) === 'on')
  const v = await newPlanVersion(staff, p.data.code, {
    monthlyPrice: fromRupees(p.data.monthlyPrice),
    includedOrders: p.data.includedOrders,
    feeBps: Math.round(p.data.feePercent * 100),
    features,
  })
  // The public pages read prices from the plans: show the new version now, not within the hour (website spec W·1).
  revalidatePath('/'); revalidatePath('/partners')
  return { ok: `Saved as version ${v.version}. Stores on older versions keep theirs.`, go: '/admin/plans' }
}
