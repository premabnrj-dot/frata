import { notFound } from 'next/navigation'
import { Money, Numeric } from '@/components/data/numeric'
import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { FieldMessage } from '@/components/ui/action-form'
import { FIELD } from '@/components/ui/field'
import { paise } from '@/domains/money/paise'
import { getMerchant } from '@/lib/admin/merchants'
import { listPlans } from '@/lib/admin/plans'
import { shopTrialsFor } from '@/lib/admin/trials'
import { ADMIN_ONLY, ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { formatPercent } from '@/lib/format'
import { dayMonthIN } from '@/lib/format-date'
import { DialogButton } from '../../../_components/form-dialog'
import { MerchantTabs } from '../tabs'
import { changePlanAction, extendShopTrialAction, setShopTrialAction } from './actions'

export const metadata = { title: 'Plan' }

const pct = (bps: number) => formatPercent(bps / 10_000, bps % 100 === 0 ? 0 : 1)
const Why = ({ optional }: { optional?: boolean }) => (
  <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Why</span>
    <input name="reason" required={!optional} minLength={optional ? undefined : 3} maxLength={200} data-error="Say why, in a few words." className={FIELD} /><FieldMessage name="reason" /></label>
)

/** Admin › a merchant › Plan (Neel N4, board MerchantPlan): the plan and the trial, each changed in a dialog. */
export default async function MerchantPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const now = new Date()
  const [m, ps, trials, admin] = await Promise.all([getMerchant(staff, id, now), listPlans(staff), shopTrialsFor(staff, [id], now), requireStaff(ADMIN_ONLY)])
  if (!m) notFound()
  const trial = trials.get(id)
  const trialOpen = trial && !trial.facts.endedAt && trial.state !== 'paid'
  const cur = m.current
  const name = m.tenant.name
  const tenant = <input type="hidden" name="tenantId" value={id} />
  const next = m.history.filter((h) => h.tp.startsAt > now).at(-1)

  const changePlan = (
    <>
      {tenant}
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">New plan</legend>
        {ps.map((p) => {
          const v = p.versions[0]!
          const isCurrent = cur?.code === p.code && cur.v.id === v.id
          return (
            <label key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-input px-3 py-2.5 text-sm has-[:checked]:border-2 has-[:checked]:border-primary">
              <span className="flex items-center gap-2"><input type="radio" name="code" value={p.code} required data-error="Choose a plan." disabled={isCurrent} />{p.name}{isCurrent && <span className="text-muted-foreground">· now</span>}</span>
              <span className="text-muted-foreground"><Money paise={paise(v.monthlyPrice)} /> a month · {v.includedOrders.toLocaleString('en-IN')} orders · {pct(v.feeBps)}</span>
            </label>
          )
        })}
        <FieldMessage name="code" />
      </fieldset>
      <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Starts</span>
        <select name="when" className={FIELD}><option value="now">Today</option><option value="next_month">The 1st of next month</option></select></label>
      <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Custom monthly price, ₹ <span className="font-normal text-muted-foreground">(optional)</span></span>
        <input name="customPrice" inputMode="numeric" className={`${FIELD} font-mono`} /></label>
      <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Why <span className="font-normal text-muted-foreground">(needed with a custom price)</span></span>
        <input name="reason" maxLength={200} className={FIELD} /><FieldMessage name="reason" /></label>
    </>
  )

  return (
    <>
      <PageHeader title={name} back={{ href: `/admin/merchants/${id}`, label: name }}
        badges={<>{cur ? <Badge>{cur.name}</Badge> : <Badge tone="danger">No plan</Badge>}
          {trialOpen && <Badge tone="info">Trial · {trial.daysLeft} {trial.daysLeft === 1 ? 'day' : 'days'} left</Badge>}</>} />
      <MerchantTabs id={id} on="plan" />
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <Section title={cur?.name ?? 'No plan'} className="text-sm"
          action={admin.ok && <DialogButton spec={{ label: 'Change plan', title: `Change ${name}'s plan?`, action: changePlanAction, fields: changePlan, keep: `Keep ${cur?.name ?? 'as it is'}`, go: `Move ${name}` }} />}>
          {cur && <p><Money paise={paise(cur.tp.customMonthlyPrice ?? cur.v.monthlyPrice)} /> a month · <Numeric>{cur.v.includedOrders.toLocaleString('en-IN')}</Numeric> orders · {pct(cur.v.feeBps)} of each delivered order</p>}
          {cur && <p className="text-muted-foreground">Version {cur.v.version} · since {dayMonthIN(cur.tp.startsAt)}{cur.tp.customMonthlyPrice !== null ? ` · custom price: ${cur.tp.reason}` : ''}</p>}
          {next && <p className="text-warn-text">Moves to {next.name} on {dayMonthIN(next.tp.startsAt)}{next.tp.byShop ? ', the store’s own change' : ''}.</p>}
        </Section>

        <Section title="Free trial" className="text-sm" id="trial"
          action={admin.ok && (!trial || !trial.facts.startedAt
            ? <DialogButton spec={{ label: trial ? 'Change length' : 'Give a trial', title: trial ? `Change ${name}'s trial?` : `Give ${name} a trial?`, action: setShopTrialAction, keep: 'Keep as it is', go: trial ? 'Change length' : 'Give a trial',
                fields: <>{tenant}<label className="flex flex-col gap-1 text-sm"><span className="font-medium">Days, 7 to 90</span><input name="days" type="number" min={7} max={90} required data-error="7 to 90 days." defaultValue={trial?.facts.days ?? 30} className={`${FIELD} font-mono`} /><FieldMessage name="days" /></label><Why /></> }} />
            : trialOpen && !trial.facts.extendedAt && trial.state !== 'paused'
              ? <DialogButton spec={{ label: 'Extend 7 days', title: `Extend ${name}'s trial by 7 days?`, description: `It ends ${dayMonthIN(new Date(trial.lastDay.getTime() + 7 * 86_400_000))} instead. A trial is extended once.`, action: extendShopTrialAction, keep: 'Keep the end', go: 'Extend 7 days', fields: <>{tenant}<Why /></> }} />
              : null)}>
          {!trial ? <p className="text-muted-foreground">No trial.</p>
            : trial.state === 'building' ? <p>{trial.facts.days} days, from when the website goes live</p>
            : <>
              <p>{trialOpen && trial.state !== 'grace' && trial.state !== 'paused' ? `Ends ${dayMonthIN(trial.lastDay)} · ${trial.daysLeft} ${trial.daysLeft === 1 ? 'day' : 'days'} left` : `Ended ${dayMonthIN(trial.lastDay)}${trial.state === 'grace' ? ' · in grace' : trial.state === 'paused' ? ' · paused' : ''}`}</p>
              <p className="text-muted-foreground">{trial.facts.days} days{trial.facts.extendedAt ? ' + 7' : ''}</p>
            </>}
        </Section>
      </div>
    </>
  )
}
