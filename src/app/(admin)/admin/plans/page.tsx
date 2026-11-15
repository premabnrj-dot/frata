import Link from 'next/link'
import { Money, Numeric } from '@/components/data/numeric'
import { PageHeader } from '@/components/layout/page-header'
import { button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { paise } from '@/domains/money/paise'
import { listPlans, storesPerVersion } from '@/lib/admin/plans'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { dayIN } from '@/lib/format-date'
import { formatPercent } from '@/lib/format'
import { trialTerms } from '@/lib/admin/trials'
import { setTrialTermsAction } from './trial-actions'
import { FieldMessage } from '@/components/ui/action-form'
import { DialogButton } from '../_components/form-dialog'

export const metadata = { title: 'Plans' }

/** Admin › Plans (Neel N4, board Reference › Plans): one row a plan; Edit opens its page (a new version); the trial a dialog. */
export default async function PlansPage() {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const [ps, counts, terms] = await Promise.all([listPlans(staff), storesPerVersion(staff, new Date()), trialTerms(staff)])
  const isAdmin = staff.role === 'admin'
  const num = 'h-11 rounded-md border border-input bg-card px-3 font-num aria-invalid:border-danger-mark md:h-9'
  return (
    <>
      <PageHeader title="Plans" meta="Prices exclude GST" />
      <ul className="divide-y divide-line-soft rounded-lg border border-border">
        {ps.map((p) => {
          const v = p.versions[0]!
          const stores = p.versions.reduce((n, x) => n + (counts.get(x.id) ?? 0), 0)
          return (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <span><b className="font-medium">{p.name}</b> <span className="text-muted-foreground">· <Money paise={paise(v.monthlyPrice)} /> · <Numeric>{v.includedOrders.toLocaleString('en-IN')}</Numeric> orders · <Numeric>{formatPercent(v.feeBps / 10_000, v.feeBps % 100 === 0 ? 0 : 1)}</Numeric> · <Numeric>{stores.toLocaleString('en-IN')}</Numeric> {stores === 1 ? 'merchant' : 'merchants'} · version {v.version}, {dayIN(v.createdAt)}</span></span>
              {isAdmin && <Link href={`/admin/plans/${p.code}`} className={button({ variant: 'secondary' })}>Edit {p.name}</Link>}
            </li>
          )
        })}
        {/* Trials TR0·4 (owner, 2026-11-08): the terms for NEW sign-ups; a running trial keeps the terms it started with. */}
        <li id="trials" className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
          <span><b className="font-medium">Free trial</b> <span className="text-muted-foreground">· {terms.days} days · live within {terms.openWindowDays} days{terms.reason ? ` · ${terms.reason}, ${dayIN(terms.updatedAt)}` : ''}</span></span>
          {isAdmin && <DialogButton spec={{ label: 'Edit the trial', title: 'Change the trial for new sign-ups?', description: 'A running trial keeps the terms it started with.', action: setTrialTermsAction, keep: 'Keep the terms', go: 'Save trial terms', fields: <>
            <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Length for new sign-ups, 7 to 45 days</span><input name="days" type="number" min={7} max={45} required data-error="7 to 45 days." defaultValue={terms.days} className={num} /><FieldMessage name="days" /></label>
            <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Days to go live, 0 to 30</span><input name="openWindowDays" type="number" min={0} max={30} required data-error="0 to 30 days." defaultValue={terms.openWindowDays} className={num} /><FieldMessage name="openWindowDays" /></label>
            <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Why</span><input name="reason" required minLength={3} maxLength={240} data-error="Say why, in a few words." className={num.replace(' font-num', '')} /><FieldMessage name="reason" /></label>
          </> }} />}
        </li>
      </ul>
    </>
  )
}
