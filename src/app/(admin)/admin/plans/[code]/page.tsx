import Link from 'next/link'
import { notFound } from 'next/navigation'
import { button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { Panel } from '@/components/ui/panel'
import { toRupees, paise } from '@/domains/money/paise'
import { PLAN_CODES, type PlanCode } from '@/domains/plans/entitlements'
import { PLAN_GRANTABLE as FEATURES } from '@/domains/modules/registry'
import { listPlans } from '@/lib/admin/plans'
import { ADMIN_ONLY, requireStaff } from '@/lib/auth/require-staff'
import { FEATURE_NAMES } from '@/domains/plans/labels'
import { newVersionAction } from './actions'
import { Section } from '@/components/layout/section'
import { Submit } from '@/components/ui/submit'

export const metadata = { title: 'Edit plan' }

const field = 'h-10 rounded-md border border-input bg-card px-3 font-mono text-sm'

export default async function EditPlanPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ error?: string }> }) {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return <Panel title={staff.message} />
  const { code } = await params
  if (!PLAN_CODES.includes(code as PlanCode)) notFound()
  const plan = (await listPlans(staff)).find((p) => p.code === code)
  if (!plan) notFound()
  const v = plan.versions[0]!
  const { error } = await searchParams
  return (
    <Section className="mx-auto max-w-xl"><form action={newVersionAction} className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Edit {plan.name}</h1>
        <p className="text-sm text-muted-foreground">Saving makes version {v.version + 1}. Stores on version {v.version} keep it until you move them.</p>
      </div>
      <Notice error={error} />
      <input type="hidden" name="code" value={plan.code} />
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5"><label htmlFor="monthlyPrice" className="text-sm font-medium">Monthly price, ₹</label><input id="monthlyPrice" name="monthlyPrice" inputMode="decimal" defaultValue={toRupees(paise(v.monthlyPrice))} className={field} /></div>
        <div className="flex flex-col gap-1.5"><label htmlFor="includedOrders" className="text-sm font-medium">Orders included</label><input id="includedOrders" name="includedOrders" inputMode="numeric" defaultValue={v.includedOrders} className={field} /></div>
        <div className="flex flex-col gap-1.5"><label htmlFor="feePercent" className="text-sm font-medium">Fee, % of delivered value</label><input id="feePercent" name="feePercent" inputMode="decimal" defaultValue={v.feeBps / 100} className={field} /></div>
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Includes</legend>
        {FEATURES.map((f) => (
          <label key={f} className="flex min-h-6 items-center gap-2 text-sm"><input type="checkbox" name={`feature_${f}`} defaultChecked={v.features.includes(f)} />{FEATURE_NAMES[f]}</label>
        ))}
        <p className="text-xs text-muted-foreground">All channels are in every plan.</p>
      </fieldset>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Link href="/admin/plans" className={button({ variant: 'secondary' })}>Keep version {v.version}</Link>
        <Submit>Save as version {v.version + 1}</Submit>
      </div>
    </form></Section>
  )
}
