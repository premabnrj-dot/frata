import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Money } from '@/components/data/numeric'
import { button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { paise } from '@/domains/money/paise'
import { getMerchant } from '@/lib/admin/merchants'
import { listPlans } from '@/lib/admin/plans'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { formatPercent } from '@/lib/format'
import { changePlanAction, endShopTrialAction, extendShopTrialAction, setShopTrialAction } from './actions'
import { shopTrialsFor } from '@/lib/admin/trials'
import { dayIN } from '@/lib/format-date'
import { ADMIN_ONLY } from '@/lib/auth/require-staff'
import { Section } from '@/components/layout/section'
import { Submit } from '@/components/ui/submit'
import { ActionForm, FieldMessage } from '@/components/ui/action-form'

export const metadata = { title: 'Change plan' }

const field = 'h-10 rounded-md border border-input bg-card px-3 text-sm'

export default async function ChangePlanPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const now = new Date()
  const [m, ps, trials] = await Promise.all([getMerchant(staff, id, now), listPlans(staff), shopTrialsFor(staff, [id], now)])
  const trial = trials.get(id)
  const isAdmin = (ADMIN_ONLY as readonly string[]).includes(staff.role)
  if (!m) notFound()
  const cur = m.current
  return (
    <div className="mx-auto max-w-xl space-y-4">
    {/* Trials TR0·4: one shop's trial. Its end is computed in one place (app_trial_recompute); Admin sets the length
        before the website goes live, extends once or ends it, each with a reason (ADMIN_ONLY, audited). */}
    <Section title="Free trial" className="text-sm" id="trial">
      {trial ? (
        <p>{trial.state === 'building' ? `Not live yet: ${trial.facts.days} days start when the website goes live.` : `${trial.state === 'paid' ? 'Ended' : trial.state === 'grace' ? 'Ended, in grace' : trial.state === 'paused' ? 'Ended, paused' : `${trial.daysLeft} days left`} · ${trial.facts.days} days${trial.facts.extendedAt ? ' + 7 extended' : ''} · last day ${dayIN(trial.lastDay)}.`}</p>
      ) : <p className="text-muted-foreground">No trial.</p>}
      {isAdmin && (!trial || !trial.facts.startedAt) && (
        <ActionForm action={setShopTrialAction} className="grid gap-2 sm:grid-cols-[8rem_1fr_auto] sm:items-end">
          <input type="hidden" name="tenantId" value={id} />
          <label className="flex flex-col gap-1"><span>Days, 7 to 90</span><input name="days" type="number" min={7} max={90} required data-error="7 to 90 days." defaultValue={trial?.facts.days ?? 30} className={`${field} font-mono`} /><FieldMessage name="days" /></label>
          <label className="flex flex-col gap-1"><span>Why</span><input name="reason" required minLength={3} maxLength={240} data-error="Say why, in a few words." className={field} /><FieldMessage name="reason" /></label>
          <Submit variant="secondary">{trial ? 'Change length' : 'Give a trial'}</Submit>
        </ActionForm>
      )}
      {isAdmin && trial && !trial.facts.endedAt && trial.state !== 'paid' && trial.state !== 'paused' && (
        <div className="grid gap-2 sm:grid-cols-2">
          {!trial.facts.extendedAt && <ActionForm action={extendShopTrialAction} className="flex flex-col gap-1"><input type="hidden" name="tenantId" value={id} /><label className="flex flex-col gap-1"><span>Why</span><input name="reason" aria-label="Why extend the trial" required minLength={3} maxLength={240} data-error="Say why, in a few words." className={field} /><FieldMessage name="reason" /></label><Submit variant="secondary">Extend 7 days</Submit></ActionForm>}
          <ActionForm action={endShopTrialAction} className="flex flex-col gap-1"><input type="hidden" name="tenantId" value={id} /><label className="flex flex-col gap-1"><span>Why</span><input name="reason" aria-label="Why end the trial" required minLength={3} maxLength={240} data-error="Say why, in a few words." className={field} /><FieldMessage name="reason" /></label><Submit variant="secondary">End the trial now</Submit></ActionForm>
        </div>
      )}
    </Section>
    {!isAdmin && <Section title="Plan" className="text-sm"><p>{cur ? `${cur.name} · version ${cur.v.version}` : 'No plan'}</p></Section>}
    {isAdmin && <Section><ActionForm action={changePlanAction} className="space-y-5">
      <h1 className="text-xl font-semibold">Change {m.tenant.name}&apos;s plan</h1>
      <input type="hidden" name="tenantId" value={id} />
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">New plan</legend>
        {ps.map((p) => {
          const v = p.versions[0]!
          const isCurrent = cur?.code === p.code && cur.v.id === v.id
          return (
            <label key={p.id} className="flex items-center justify-between rounded-md border border-input px-3 py-2.5 text-sm has-[:checked]:border-2 has-[:checked]:border-primary">
              <span className="flex items-center gap-2">
                <input type="radio" name="code" value={p.code} required data-error="Choose a plan." defaultChecked={!isCurrent && cur?.code !== p.code && p.code === 'scale'} />
                {p.name} · version {v.version}{isCurrent && <span className="text-muted-foreground">(current)</span>}
              </span>
              <span className="text-muted-foreground"><Money paise={paise(v.monthlyPrice)} />/mo · {v.includedOrders.toLocaleString('en-IN')} orders · {formatPercent(v.feeBps / 10_000, v.feeBps % 100 === 0 ? 0 : 1)}</span>
            </label>
          )
        })}
        <FieldMessage name="code" />
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="when" className="text-sm font-medium">Starts</label>
          <select id="when" name="when" className={field}><option value="now">Today</option><option value="next_month">The 1st of next month</option></select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="customPrice" className="text-sm font-medium">Custom monthly price, ₹ <span className="font-normal text-muted-foreground">(optional)</span></label>
          <input id="customPrice" name="customPrice" inputMode="numeric" className={`${field} font-mono`} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="reason" className="text-sm font-medium">Reason <span className="font-normal text-muted-foreground">(needed with a custom price)</span></label>
          <input id="reason" name="reason" maxLength={200} className={field} />
          <FieldMessage name="reason" />
        </div>
      </div>
      <p className="rounded-md bg-muted px-3 py-2 text-sm">
        The store moves to the current version of the plan you choose: its price, included orders, fee and features. {cur ? `Today: ${cur.name}, ${cur.v.includedOrders.toLocaleString('en-IN')} orders included.` : 'It has no plan today.'} Nothing is charged until billing arrives.
      </p>
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Link href={`/admin/merchants/${id}`} className={button({ variant: 'secondary' })}>Keep {cur?.name ?? 'as it is'}</Link>
        <Submit>Move {m.tenant.name}</Submit>
      </div>
    </ActionForm></Section>}
    </div>
  )
}
