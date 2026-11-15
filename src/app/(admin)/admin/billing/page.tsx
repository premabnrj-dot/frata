import Link from 'next/link'
import { Money } from '@/components/data/numeric'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button, button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { Section } from '@/components/layout/section'
import { Steps } from '@/components/ui/steps'
import { ViewTabs } from '@/components/ui/view-tabs'
import { ActionForm, FieldMessage } from '@/components/ui/action-form'
import { Submit } from '@/components/ui/submit'
import { FIELD } from '@/components/ui/field'
import { paise } from '@/domains/money/paise'
import { STATE_LABEL } from '@/domains/billing/status'
import { monthOfYM, monthStartIST, ymOf } from '@/domains/time/month'
import { billingMonth, toIssue, type DraftRow } from '@/lib/admin/billing'
import { draftableMonths } from '@/lib/billing/run'
import { ADMIN_ONLY, requireStaff } from '@/lib/auth/require-staff'
import { formatInr } from '@/lib/format'
import { DialogButton, MoreDialogs } from '../_components/form-dialog'
import { collectAction, issueAction, runDraftsAction } from './actions'

export const metadata = { title: 'Billing' }
export const dynamic = 'force-dynamic'

const VIEWS = [['needs', 'Needs you'], ['due', 'Due'], ['paid', 'Paid'], ['drafts', 'Drafts']] as const
type View = (typeof VIEWS)[number][0]
const IN: Record<View, (r: DraftRow) => boolean> = {
  needs: (r) => r.toRefund > 0,
  due: (r) => r.state === 'due',
  paid: (r) => r.state === 'paid' || r.state === 'credited',
  drafts: (r) => !r.issuedAt,
}
const LONG = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })
const SHORT = new Intl.DateTimeFormat('en-IN', { month: 'long', timeZone: 'Asia/Kolkata' })
const inr = (p: number) => formatInr(paise(p), { decimals: true })

/** An invoice's state in words: what it needs first. */
function stateOf(r: DraftRow) {
  if (r.toRefund > 0) return <Badge tone="danger">Paid {formatInr(paise(r.toRefund))} too much</Badge>
  if (!r.issuedAt) return <Badge>{r.rolled ? 'Rolls to next month' : r.carryOut < 0 ? 'Balance carried' : 'Draft'}</Badge>
  if (!r.number) return <Badge>Nothing to pay</Badge>
  if (r.state === 'due') return <Badge tone="warn">Due {inr(r.due)}</Badge>
  return <Badge tone={r.state === 'paid' ? 'ok' : 'neutral'}>{STATE_LABEL[r.state]}</Badge>
}

/** Admin › Billing (Neel N4, board Billing): this month's run, one step in view; the invoices by what they need. */
export default async function BillingPage({ searchParams }: { searchParams: Promise<{ month?: string; view?: string }> }) {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return <Panel title={staff.message} />
  const sp = await searchParams
  const now = new Date()
  const start = (sp.month && monthOfYM(sp.month)) || monthStartIST(now)
  const ym = ymOf(start)
  const rows = await billingMonth(staff, start)
  const ready = toIssue(rows, start)
  const begun = start.getTime() <= now.getTime()
  const label = SHORT.format(start)
  const canDraft = draftableMonths(now).some((m) => m.getTime() === start.getTime())
  const counts = Object.fromEntries(VIEWS.map(([k]) => [k, rows.filter(IN[k]).length])) as Record<View, number>
  const asked = VIEWS.find(([k]) => k === sp.view)?.[0]
  const view: View = asked ?? (counts.needs ? 'needs' : counts.due ? 'due' : counts.drafts && !counts.paid ? 'drafts' : 'paid')
  const shown = rows.filter(IN[view])
  const due = rows.filter(IN.due)
  // The run's step: drafts, then issue, then collect (one step in view, its one action).
  const step = rows.length === 0 ? 0 : ready.open > 0 ? 1 : 2
  const months = Array.from({ length: 13 }, (_, i) => { const d = new Date(monthStartIST(now)); d.setUTCMonth(d.getUTCMonth() + 1 - i); return monthStartIST(new Date(d.getTime() + 15 * 86_400_000)) })
  const monthField = <input type="hidden" name="month" value={ym} />

  return (
    <>
      <PageHeader title="Billing"
        badges={<form className="flex items-center gap-2"><label className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">Month</span>
          <select name="month" defaultValue={ym} className={FIELD}>{months.map((m) => <option key={ymOf(m)} value={ymOf(m)}>{LONG.format(m)}</option>)}</select></label>
          <Button type="submit" variant="secondary" size="sm">Show</Button></form>}
        actions={<MoreDialogs specs={[
          ...(canDraft ? [{ label: `Run drafts for ${label}…`, title: `Run drafts for ${label}?`, description: 'Every store on a plan gets its draft redone from today’s figures.', action: runDraftsAction, fields: monthField, keep: 'Keep the drafts', go: 'Run drafts' }] : []),
          { label: 'Run collection now…', title: 'Run collection now?', description: 'Autopay is tried on every due invoice that allows it.', action: collectAction, fields: monthField, keep: 'Not now', go: 'Run collection' },
        ]} />} />

      <Section labelledBy="run-h" className="space-y-3">
        <Steps label={`${label}'s run`} current={step} steps={[rows.length ? `Drafts · ${rows.length}` : 'Drafts', 'Issue', 'Collect']} />
        {step === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <b id="run-h" className="font-medium">No invoices for {label} yet</b>
            {canDraft && <ActionForm action={runDraftsAction}>{monthField}<Submit>Run drafts for {label}</Submit></ActionForm>}
          </div>
        ) : step === 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex flex-col"><b id="run-h" className="font-medium">Issue {ready.count} {ready.count === 1 ? 'invoice' : 'invoices'} for {label}</b>
              <span className="text-sm text-muted-foreground">{inr(ready.total)} with GST{ready.open > ready.count ? ` · ${ready.open - ready.count} with nothing to pay will close` : ''}</span></span>
            {!begun ? <span className="text-sm text-muted-foreground">Issued from 1 {label}</span>
              : ready.stale > 0 ? <ActionForm action={runDraftsAction}>{monthField}<Submit>Run drafts again</Submit></ActionForm>
              : ready.count > 0 && <DialogButton variant="primary" spec={{ label: `Issue ${ready.count} ${ready.count === 1 ? 'invoice' : 'invoices'}`, title: `Issue ${ready.count} ${ready.count === 1 ? 'invoice' : 'invoices'} for ${label}?`, danger: true,
                  description: 'Each gets its number now. An issued invoice never changes. A correction is a credit note.', action: issueAction, confirm: true, keep: 'Not yet', go: `Issue ${ready.count}`,
                  fields: <>{monthField}<input type="hidden" name="count" value={ready.count} /><input type="hidden" name="total" value={ready.total} />
                    <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Type ISSUE {ready.count} to confirm</span><input name="confirm" autoComplete="off" className={FIELD} /><FieldMessage name="confirm" /></label></> }} />}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex flex-col"><b id="run-h" className="font-medium">{due.length ? `${due.length} ${due.length === 1 ? 'invoice' : 'invoices'} due` : `Every ${label} invoice is settled`}</b>
              {due.length > 0 && <span className="text-sm text-muted-foreground">{inr(due.reduce((t, r) => t + r.due, 0))} to collect</span>}</span>
            {rows.some((r) => r.number) && <a href={`/admin/billing/export?month=${ym}`} className={button({ variant: 'secondary' })}>Download GST export</a>}
          </div>
        )}
      </Section>

      {rows.length > 0 && <>
        <ViewTabs label="Invoices" tabs={VIEWS.map(([k, l]) => ({ href: `/admin/billing?month=${ym}&view=${k}`, label: l, count: counts[k], current: view === k }))} />
        {shown.length === 0 ? <Panel title={view === 'needs' ? 'Nothing waits.' : `No ${VIEWS.find(([k]) => k === view)![1].toLowerCase()} invoices`} /> : (
          <DataTable label={`Invoices for ${label}`}>
            <DataTableHead><th>Invoice</th><th>Merchant</th><th className="text-right">Total</th><th>State</th></DataTableHead>
            <DataTableBody>
              {shown.map((r) => (
                <DataTableRow key={r.id}>
                  <Td cell="a">{r.number ? <Link href={`/admin/billing/invoice/${r.id}`} data-row-link className="font-medium hover:underline">{r.number}</Link> : <span className="text-muted-foreground">Draft</span>}</Td>
                  <Td cell="c">{r.shop}</Td>
                  <Td cell="b" className="text-right"><Money paise={paise(r.total)} decimals /></Td>
                  <Td cell="d">{stateOf(r)}</Td>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        )}
      </>}
    </>
  )
}
