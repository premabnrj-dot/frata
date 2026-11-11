'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { fromRupees } from '@/domains/money/paise'
import { PLAN_CODES } from '@/domains/plans/entitlements'
import { nextMonthStartIST } from '@/domains/time/month'
import { changeTenantPlan } from '@/lib/admin/plans'
import { ADMIN_ONLY, requireStaff } from '@/lib/auth/require-staff'
import { endShopTrial, extendShopTrial, setShopTrial, trialError } from '@/lib/admin/trials'
import { revalidatePath } from 'next/cache'
import { errName } from '@/lib/log'

const Change = z.object({
  tenantId: z.uuid(),
  code: z.enum(PLAN_CODES),
  when: z.enum(['now', 'next_month']),
  customPrice: z.string().optional().transform((v) => (v && v.trim() ? Number(v.replace(/[₹,\s]/g, '')) : null)).refine((v) => v === null || (Number.isFinite(v) && v >= 0), 'price'),
  reason: z.string().trim().max(200).optional().transform((v) => v || null),
})

export async function changePlanAction(form: FormData) {
  // Admin writes are admin-role only (frata-design-language § Apps and modules; UX audit 2026-11-11: support could move
  // a shop's plan and set a custom price). Support reads the tab and sees no form.
  const staff = await requireStaff(ADMIN_ONLY)
  const tid = z.uuid().safeParse(form.get('tenantId'))
  if (!tid.success) redirect(`/admin/merchants?error=${encodeURIComponent('That form was incomplete. Nothing was changed.')}`)
  const id = tid.data
  if (!staff.ok) redirect(`/admin/merchants/${id}/plan?error=${encodeURIComponent('Only an admin can change a plan.')}`)
  const p = Change.safeParse(Object.fromEntries(form))
  if (!p.success) redirect(`/admin/merchants/${id}/plan?error=${encodeURIComponent('Check the plan and the custom price')}`)
  if (p.data.customPrice !== null && !p.data.reason) redirect(`/admin/merchants/${id}/plan?error=${encodeURIComponent('A custom price needs a reason')}`)
  const now = new Date()
  try {
    await changeTenantPlan(staff, p.data.tenantId, {
      code: p.data.code,
      startsAt: p.data.when === 'now' ? now : nextMonthStartIST(now),
      // Trials (security review TR0): a trial is never typed here — only the audited, ADMIN_ONLY trial definers set one
      // (Free trial card); a shop with a trial keeps it across the change (app_trial_recompute).
      trialEndsAt: null,
      customMonthlyPrice: p.data.customPrice === null ? null : fromRupees(p.data.customPrice),
      reason: p.data.reason,
    })
  } catch (err) {
    console.error('[changePlanAction]', errName(err))
    redirect(`/admin/merchants/${id}/plan?error=${encodeURIComponent('We could not change the plan. Nothing was saved.')}`)
  }
  redirect(`/admin/merchants/${id}?ok=${encodeURIComponent('Plan changed.')}`)
}

// ── Trials TR0·4: one shop's trial (ADMIN_ONLY; the definers check again, require the reason and audit it). ──
const TrialBase = z.object({ tenantId: z.uuid(), reason: z.string().trim().min(3).max(240) })
const TrialDays = TrialBase.extend({ days: z.coerce.number().int().min(7).max(90) })
async function trialAction(form: FormData, schema: typeof TrialBase | typeof TrialDays, run: (staff: Extract<Awaited<ReturnType<typeof requireStaff>>, { ok: true }>, d: { tenantId: string; reason: string; days?: number }) => Promise<void>, done: string) {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) redirect('/admin')
  const id = String(form.get('tenantId') ?? '')
  const back = `/admin/merchants/${/^[0-9a-f-]{36}$/.test(id) ? id : ''}/plan`
  const p = schema.safeParse(Object.fromEntries(form))
  if (!p.success) redirect(`${back}?error=${encodeURIComponent('A trial is 7 to 90 days for one shop, and needs a reason.')}`)
  try { await run(staff, p.data) } catch (e) {
    console.error('[trial.shop]', errName(e))
    redirect(`${back}?error=${encodeURIComponent(trialError(e))}`)
  }
  revalidatePath(back)
  redirect(`${back}?ok=${encodeURIComponent(done)}`)
}
export async function setShopTrialAction(form: FormData) {
  await trialAction(form, TrialDays, (s, d) => setShopTrial(s, d.tenantId, d.days!, d.reason), 'Trial saved.')
}
export async function extendShopTrialAction(form: FormData) {
  await trialAction(form, TrialBase, (s, d) => extendShopTrial(s, d.tenantId, d.reason), 'Trial extended by 7 days.')
}
export async function endShopTrialAction(form: FormData) {
  await trialAction(form, TrialBase, (s, d) => endShopTrial(s, d.tenantId, d.reason), 'Trial ended.')
}
