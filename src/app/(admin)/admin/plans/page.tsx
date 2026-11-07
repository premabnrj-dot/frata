import Link from 'next/link'
import { Money, Numeric } from '@/components/data/numeric'
import { PageHeader } from '@/components/layout/page-header'
import { Notice } from '@/components/ui/notice'
import { Panel } from '@/components/ui/panel'
import { paise } from '@/domains/money/paise'
import { FEATURES } from '@/domains/plans/entitlements'
import { FEATURE_NAMES } from '@/domains/plans/labels'
import { listPlans, storesPerVersion } from '@/lib/admin/plans'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { dayIN } from '@/lib/format-date'
import { formatPercent } from '@/lib/format'

export const metadata = { title: 'Plans' }

export default async function PlansPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const [ps, counts] = await Promise.all([listPlans(staff), storesPerVersion(staff, new Date())])
  const { ok } = await searchParams
  const cell = 'border-l border-border px-4 py-3'
  return (
    <>
      <PageHeader title="Plans" actions={<span className="text-sm text-muted-foreground">Prices exclude GST · not charged until billing arrives in Phase 6</span>} />
      <Notice ok={ok} />
      <div className="relative overflow-x-auto rounded-md border border-border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-4 py-3"></th>
              {ps.map((p) => (
                <th key={p.id} className={cell}>
                  <div className="text-base font-semibold">{p.name}</div>
                  <div className="text-xs font-normal text-muted-foreground">Version {p.versions[0]!.version} · since {dayIN(p.versions[0]!.createdAt)}</div>
                  {staff.role === 'admin' && <Link href={`/admin/plans/${p.code}`} className="text-xs font-normal hover:underline">Edit {p.name}</Link>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="[&>tr]:border-b [&>tr]:border-border">
            <tr><td className="px-4 py-3 font-medium">Monthly price</td>{ps.map((p) => <td key={p.id} className={cell}><Money paise={paise(p.versions[0]!.monthlyPrice)} /></td>)}</tr>
            <tr><td className="px-4 py-3 font-medium">Orders included a month</td>{ps.map((p) => <td key={p.id} className={cell}><Numeric>{p.versions[0]!.includedOrders.toLocaleString('en-IN')}</Numeric></td>)}</tr>
            <tr><td className="px-4 py-3 font-medium">Fee per delivered order</td>{ps.map((p) => <td key={p.id} className={cell}><Numeric>{formatPercent(p.versions[0]!.feeBps / 10_000, p.versions[0]!.feeBps % 100 === 0 ? 0 : 1)}</Numeric> <span className="text-muted-foreground">of its value</span></td>)}</tr>
            <tr><td className="px-4 py-3 font-medium">Past the included orders</td>{ps.map((p, i) => <td key={p.id} className={`${cell} text-muted-foreground`}>Keeps selling; {ps[i + 1] ? `suggest ${ps[i + 1]!.name}` : 'talk to us'}</td>)}</tr>
            <tr><td colSpan={ps.length + 1} className="bg-muted/50 px-4 py-2 text-xs font-semibold text-muted-foreground">WHAT IT INCLUDES</td></tr>
            <tr><td className="px-4 py-3">All channels</td>{ps.map((p) => <td key={p.id} className={`${cell} font-medium text-ok-text`}>Included</td>)}</tr>
            {FEATURES.map((f) => (
              <tr key={f}><td className="px-4 py-3">{FEATURE_NAMES[f]}</td>{ps.map((p) => {
                const on = p.versions[0]!.features.includes(f)
                return <td key={p.id} className={`${cell} ${on ? 'font-medium text-ok-text' : 'text-muted-foreground'}`}>{on ? 'Included' : 'Not included'}</td>
              })}</tr>
            ))}
            <tr><td className="px-4 py-3 font-medium">Stores on it now</td>{ps.map((p) => <td key={p.id} className={cell}><Numeric>{p.versions.reduce((n, v) => n + (counts.get(v.id) ?? 0), 0)}</Numeric>{p.versions.length > 1 && <span className="text-xs text-muted-foreground"> across {p.versions.length} versions</span>}</td>)}</tr>
          </tbody>
        </table>
      </div>
      <section className="max-w-2xl space-y-2 rounded-md border border-border bg-card p-5 text-sm">
        <h2 className="text-[15px] font-semibold">Changing a plan</h2>
        <p className="text-muted-foreground">Saving a new price, fee or set of features makes a new version. Stores already on the old version keep it until you move them; new stores get the new one. Nothing a merchant has agreed to changes behind their back.</p>
      </section>
    </>
  )
}
