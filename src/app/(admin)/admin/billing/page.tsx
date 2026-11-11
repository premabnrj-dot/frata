import { Money, Numeric } from '@/components/data/numeric'
import { PageHeader } from '@/components/layout/page-header'
import { button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { Panel } from '@/components/ui/panel'
import { paise } from '@/domains/money/paise'
import { monthOfYM, monthStartIST, ymOf } from '@/domains/time/month'
import { billingMonth, toIssue } from '@/lib/admin/billing'
import Link from 'next/link'
import { STATE_LABEL } from '@/domains/billing/status'
import { draftableMonths } from '@/lib/billing/run'
import { usage } from '@/domains/plans/entitlements'
import { ADMIN_ONLY, requireStaff } from '@/lib/auth/require-staff'
import { dayIN } from '@/lib/format-date'
import { collectAction, issueAction, runDraftsAction } from './actions'
import { Submit } from '@/components/ui/submit'

export const metadata = { title: 'Billing' }

// Admin › Billing (billing B0): each shop's invoice for a month, read-only. Drafts are redrafted daily by the cron and
// on "Run drafts"; nothing is issued, charged or sent until B2/B3 (test mode until Frrata's GSTIN and gateway exist).
export default async function BillingPage({ searchParams }: { searchParams: Promise<{ month?: string; ok?: string; error?: string }> }) {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return <Panel title={staff.message} />
  const { month, ok, error } = await searchParams
  const start = (month && monthOfYM(month)) || monthStartIST(new Date())
  const ym = ymOf(start)
  const rows = await billingMonth(staff, start)
  const ready = toIssue(rows, start)
  const begun = start.getTime() <= Date.now()
  const sum = (k: 'taxable' | 'gst' | 'total') => rows.reduce((t, r) => t + r[k], 0)
  const label = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(start)
  const field = 'h-10 rounded-md border border-border bg-background px-3 text-sm md:h-9'
  return (
    <>
      <PageHeader title="Billing" meta={`Invoices dated 1 ${label}: the plan for ${label} in advance, the fee on last month's delivered orders. Without Frrata's GSTIN set, issuing is test mode: a TEST series, never collected.`} />
      <Notice ok={ok} error={error} />
      <div className="flex flex-wrap items-end gap-2">
        <form className="flex items-end gap-2">
          <label className="flex flex-col gap-1.5 text-sm font-medium">Month<input type="month" name="month" defaultValue={ym} className={field} /></label>
          <button className={button({ variant: 'secondary' })}>Show</button>
        </form>
        {draftableMonths(new Date()).some((m) => m.getTime() === start.getTime()) && (
          <form action={runDraftsAction}>
            <input type="hidden" name="month" value={ym} />
            <Submit>Run drafts for {label}</Submit>
          </form>
        )}
      </div>
      {begun && ready.open > 0 && (
        <Panel title={`Issue ${label}`}>
          <p className="text-sm">{ready.count} invoice{ready.count === 1 ? '' : 's'} to issue, totalling <Money paise={paise(ready.total)} decimals /> with GST{ready.open > ready.count ? `; ${ready.open - ready.count} with nothing to pay will close` : ''}. Numbers are given now, in order; an issued invoice never changes (a correction is a credit note).</p>
          {ready.stale > 0 ? <p className="text-sm text-warn-text">{ready.stale} draft{ready.stale === 1 ? ' was' : 's were'} made before the 1st: run drafts for {label} again first.</p> : ready.count > 0 && (
            <form action={issueAction} className="mt-2 flex flex-wrap items-end gap-2">
              <input type="hidden" name="month" value={ym} /><input type="hidden" name="count" value={ready.count} /><input type="hidden" name="total" value={ready.total} />
              <label className="flex flex-col gap-1.5 text-sm font-medium">Type ISSUE {ready.count} to confirm<input name="confirm" autoComplete="off" className={field} /></label>
              <Submit variant="destructive">Issue {ready.count} invoice{ready.count === 1 ? '' : 's'}</Submit>
            </form>
          )}
        </Panel>
      )}
      <form action={collectAction}><input type="hidden" name="month" value={ym} /><Submit variant="secondary">Run collection now</Submit></form>
      {rows.some((r) => r.number) && <p className="text-sm"><a href={`/admin/billing/export?month=${ym}`} className="underline">Download the GST export for {label} (CSV)</a></p>}
      {rows.length === 0 ? (
        <Panel title={`No invoices for ${label} yet`}>The daily run drafts this month and next for every shop on a plan. Run drafts to make them now.</Panel>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <caption className="sr-only">Invoices for {label}</caption>
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr><th className="px-4 py-2 font-medium">Shop</th><th className="px-4 py-2 text-right font-medium">Delivered orders</th><th className="px-4 py-2 text-right font-medium">Taxable</th><th className="px-4 py-2 text-right font-medium">GST</th><th className="px-4 py-2 text-right font-medium">Total</th><th className="px-4 py-2 font-medium">State</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{r.number ? <Link href={`/admin/billing/invoice/${r.id}`} className="underline">{r.shop}</Link> : r.shop}</td>
                  <td className="px-4 py-3 text-right"><Numeric>{r.ordersBilled.toLocaleString('en-IN')}</Numeric> <span className="text-muted-foreground">of {r.includedOrders.toLocaleString('en-IN')}</span>{r.includedOrders > 0 && usage(r.ordersBilled, r.includedOrders).over && <span className="ml-1 text-warning-text">over</span>}</td>
                  <td className="px-4 py-3 text-right"><Money paise={paise(r.taxable)} decimals /></td>
                  <td className="px-4 py-3 text-right"><Money paise={paise(r.gst)} decimals /></td>
                  <td className="px-4 py-3 text-right font-semibold"><Money paise={paise(r.total)} decimals /></td>
                  <td className="px-4 py-3 text-muted-foreground">{r.issuedAt ? (r.number ? <>{r.number} · {r.state === 'due' ? <span className="text-warn-text">due <Money paise={paise(r.due)} decimals /></span> : STATE_LABEL[r.state]}</> : 'Closed: nothing to pay') : r.rolled ? 'Rolls to next month (under ₹100)' : r.carryOut < 0 ? 'Balance carried forward' : `Draft · ${dayIN(r.draftedAt)}`}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-border font-semibold">
              <tr><td className="px-4 py-3">{rows.length} shop{rows.length === 1 ? '' : 's'}</td><td /><td className="px-4 py-3 text-right"><Money paise={paise(sum('taxable'))} decimals /></td><td className="px-4 py-3 text-right"><Money paise={paise(sum('gst'))} decimals /></td><td className="px-4 py-3 text-right"><Money paise={paise(sum('total'))} decimals /></td><td /></tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  )
}
