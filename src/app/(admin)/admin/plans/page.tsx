import Link from 'next/link'
import { Money, Numeric } from '@/components/data/numeric'
import { PageHeader } from '@/components/layout/page-header'
import { button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { Panel } from '@/components/ui/panel'
import { paise } from '@/domains/money/paise'
import { PLAN_GRANTABLE as FEATURES } from '@/domains/modules/registry'
import { FEATURE_NAMES } from '@/domains/plans/labels'
import { listPlans, storesPerVersion } from '@/lib/admin/plans'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { dayIN } from '@/lib/format-date'
import { formatPercent } from '@/lib/format'
import { Section } from '@/components/layout/section'
import { trialTerms } from '@/lib/admin/trials'
import { setTrialTermsAction } from './trial-actions'
import { Submit } from '@/components/ui/submit'

export const metadata = { title: 'Plans' }

export default async function PlansPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const [ps, counts, terms] = await Promise.all([listPlans(staff), storesPerVersion(staff, new Date()), trialTerms(staff)])
  const { ok, error } = await searchParams
  const cell = 'border-l border-border px-4 py-3'
  return (
    <>
      <PageHeader title="Plans" actions={<span className="text-sm text-muted-foreground">Prices exclude GST · not charged until billing arrives</span>} />
      <Notice ok={ok} error={error} />
      {/* A plan matrix does not reflow into rows: on a phone each plan is its own card (rule 15). */}
      <div className="space-y-3 md:hidden">
        {ps.map((p, i) => {
          const v = p.versions[0]!
          const stores = p.versions.reduce((n, x) => n + (counts.get(x.id) ?? 0), 0)
          return (
            <Section key={p.id} title={p.name} action={staff.role === 'admin' && <Link href={`/admin/plans/${p.code}`} className={button({ variant: 'secondary' })}>Edit {p.name}</Link>} className="text-sm">
              <p className="-mt-2 text-xs text-muted-foreground">Version {v.version} · since {dayIN(v.createdAt)}</p>
              <dl className="divide-y divide-border">
                <div className="flex justify-between gap-3 py-1.5"><dt>Monthly price</dt><dd><Money paise={paise(v.monthlyPrice)} /></dd></div>
                <div className="flex justify-between gap-3 py-1.5"><dt>Orders included a month</dt><dd><Numeric>{v.includedOrders.toLocaleString('en-IN')}</Numeric></dd></div>
                <div className="flex justify-between gap-3 py-1.5"><dt>Fee per delivered order</dt><dd><Numeric>{formatPercent(v.feeBps / 10_000, v.feeBps % 100 === 0 ? 0 : 1)}</Numeric></dd></div>
                <div className="flex justify-between gap-3 py-1.5"><dt>Past the included orders</dt><dd className="text-right text-muted-foreground">Keeps selling; {ps[i + 1] ? `suggest ${ps[i + 1]!.name}` : 'talk to us'}</dd></div>
                <div className="flex justify-between gap-3 py-1.5"><dt>Includes</dt><dd className="text-right">{['All channels', ...FEATURES.filter((f) => v.features.includes(f)).map((f) => FEATURE_NAMES[f])].join(', ')}</dd></div>
                <div className="flex justify-between gap-3 py-1.5"><dt>Stores on it now</dt><dd className="text-right"><Numeric>{stores.toLocaleString('en-IN')}</Numeric>{p.versions.length > 1 && <span className="text-xs text-muted-foreground"> across {p.versions.length} versions</span>}</dd></div>
              </dl>
            </Section>
          )
        })}
      </div>
      <div className="relative hidden overflow-x-auto rounded-md border border-border bg-card md:block">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-4 py-3"></th>
              {ps.map((p) => (
                <th key={p.id} className={cell}>
                  <div className="text-base font-semibold">{p.name}</div>
                  <div className="text-xs font-normal text-muted-foreground">Version {p.versions[0]!.version} · since {dayIN(p.versions[0]!.createdAt)}</div>
                  {staff.role === 'admin' && <Link href={`/admin/plans/${p.code}`} className={`${button({ variant: 'secondary' })} mt-2`}>Edit {p.name}</Link>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="[&>tr]:border-b [&>tr]:border-border">
            <tr><td className="px-4 py-3 font-medium">Monthly price</td>{ps.map((p) => <td key={p.id} className={`${cell} text-right`}><Money paise={paise(p.versions[0]!.monthlyPrice)} /></td>)}</tr>
            <tr><td className="px-4 py-3 font-medium">Orders included a month</td>{ps.map((p) => <td key={p.id} className={`${cell} text-right`}><Numeric>{p.versions[0]!.includedOrders.toLocaleString('en-IN')}</Numeric></td>)}</tr>
            <tr><td className="px-4 py-3 font-medium">Fee per delivered order</td>{ps.map((p) => <td key={p.id} className={`${cell} text-right`}><Numeric>{formatPercent(p.versions[0]!.feeBps / 10_000, p.versions[0]!.feeBps % 100 === 0 ? 0 : 1)}</Numeric> <span className="text-muted-foreground">of its value</span></td>)}</tr>
            <tr><td className="px-4 py-3 font-medium">Past the included orders</td>{ps.map((p, i) => <td key={p.id} className={`${cell} text-muted-foreground`}>Keeps selling; {ps[i + 1] ? `suggest ${ps[i + 1]!.name}` : 'talk to us'}</td>)}</tr>
            <tr><td colSpan={ps.length + 1} className="bg-muted/50 px-4 py-2 text-xs font-semibold text-muted-foreground">WHAT IT INCLUDES</td></tr>
            <tr><td className="px-4 py-3">All channels</td>{ps.map((p) => <td key={p.id} className={`${cell} font-medium text-ok-text`}>Included</td>)}</tr>
            {FEATURES.map((f) => (
              <tr key={f}><td className="px-4 py-3">{FEATURE_NAMES[f]}</td>{ps.map((p) => {
                const on = p.versions[0]!.features.includes(f)
                return <td key={p.id} className={`${cell} ${on ? 'font-medium text-ok-text' : 'text-muted-foreground'}`}>{on ? 'Included' : 'Not included'}</td>
              })}</tr>
            ))}
            <tr><td className="px-4 py-3 font-medium">Stores on it now</td>{ps.map((p) => <td key={p.id} className={`${cell} text-right`}><Numeric>{p.versions.reduce((n, v) => n + (counts.get(v.id) ?? 0), 0).toLocaleString('en-IN')}</Numeric>{p.versions.length > 1 && <span className="text-xs text-muted-foreground"> across {p.versions.length} versions</span>}</td>)}</tr>
          </tbody>
        </table>
      </div>
      {/* Trials TR0·4 (owner, 2026-11-08): the terms for NEW sign-ups; a running trial keeps the terms it started with. */}
      <Section title="Free trials" className="max-w-2xl text-sm" id="trials">
        <p><strong>{terms.days} days</strong> from going live · <strong>{terms.openWindowDays} days</strong> to go live{terms.reason && <span className="text-muted-foreground"> · {terms.reason}, {dayIN(terms.updatedAt)}</span>}</p>
        {staff.role === 'admin' && (
          <form action={setTrialTermsAction} className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5"><span className="font-medium">Length for new sign-ups, 7 to 45 days</span>
              <input name="days" type="number" min={7} max={45} required defaultValue={terms.days} className="h-10 rounded-md border border-input bg-card px-3 font-mono" /></label>
            <label className="flex flex-col gap-1.5"><span className="font-medium">Days to go live, 0 to 30</span>
              <input name="openWindowDays" type="number" min={0} max={30} required defaultValue={terms.openWindowDays} className="h-10 rounded-md border border-input bg-card px-3 font-mono" /></label>
            <label className="flex flex-col gap-1.5 sm:col-span-2"><span className="font-medium">Why</span>
              <input name="reason" required minLength={3} maxLength={240} className="h-10 rounded-md border border-input bg-card px-3" /></label>
            <div className="sm:col-span-2"><Submit>Save trial terms</Submit></div>
          </form>
        )}
      </Section>
      <Section title="Changing a plan" className="max-w-2xl text-sm">
        <p className="text-muted-foreground">Saving a new price, fee or set of features makes a new version. Stores already on the old version keep it until you move them; new stores get the new one. Nothing a merchant has agreed to changes behind their back.</p>
      </Section>
    </>
  )
}
