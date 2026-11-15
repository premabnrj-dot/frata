import Link from 'next/link'
import { Section } from '@/components/layout/section'
import { Money } from '@/components/data/numeric'
import { DataTable, DataTableBody, DataTableHead, DataTableRow } from '@/components/data/data-table'
import { Badge, Tag } from '@/components/ui/badge'
import { button } from '@/components/ui/button'
import { STATE_LABEL } from '@/domains/billing/status'
import { paise } from '@/domains/money/paise'
import { dayIN, dayMonthIN, monthYearIN } from '@/lib/format-date'
import type { BillingOverview, Paying, PaymentRow } from '@/lib/queries/billing'
import { PayNow, SetUpAutopay, StopAutopay } from '../autopay'
import { billingHref } from './tabs'

export const INVOICE_FILTERS = [['all', 'All'], ['due', 'Due'], ['paid', 'Paid'], ['credit', 'Credit notes']] as const
export type InvoiceFilter = (typeof INVOICE_FILTERS)[number][0]
export const filterOf = (v: unknown): InvoiceFilter => (INVOICE_FILTERS.some(([k]) => k === v) ? (v as InvoiceFilter) : 'all')

type Inv = BillingOverview['invoices'][number]

/** Invoices (mockup § Invoices): filter, pay what is due, trace a bill to its charges, download its PDF. */
export function Invoices({ invoices, show, canPay, testGateway }: { invoices: Inv[]; show: InvoiceFilter; canPay: boolean; testGateway: boolean }) {
  const keep = invoices.filter((i) => show === 'all' || (show === 'due' ? i.state === 'due' : show === 'paid' ? i.state === 'paid' : i.credits.length > 0))
  return (
    <Section ariaLabel="Invoices">
      <nav aria-label="Show" className="mb-3 flex flex-wrap gap-1.5">
        {INVOICE_FILTERS.map(([k, l]) => <Link key={k} href={billingHref('invoices', { show: k === 'all' ? undefined : k })} aria-current={show === k ? 'page' : undefined}
          className={`inline-flex h-7.5 items-center rounded-full border px-3 text-label font-medium ${show === k ? 'border-chart-now bg-select text-select-foreground' : 'border-border bg-card'}`}>{l}</Link>)}
      </nav>
      <DataTable label="Invoices">
        <DataTableHead><th>Month</th><th>Number</th><th className="text-right">Amount</th><th>Status</th><th><span className="sr-only">Actions</span></th></DataTableHead>
        <DataTableBody>
          {keep.map((i) => (
            <DataTableRow key={i.id}>
              <td>{monthYearIN(i.periodStart)}</td>
              <td className="font-mono text-label">{i.number}{i.credits.map((c) => <Link key={c.number} href={`/console/settings/billing/invoice/${i.id}?credit=${encodeURIComponent(c.number)}`} className="ml-2"><Tag>Credit note {c.number}</Tag></Link>)}</td>
              <td className="text-right"><Money paise={paise(i.total)} decimals /></td>
              <td>{i.testMode ? <Badge tone="neutral">Test · {STATE_LABEL[i.state].toLowerCase()}</Badge>
                : i.state === 'due' ? <Badge tone="warn">Due <Money paise={paise(i.due)} decimals /></Badge> : <Badge tone={i.state === 'paid' ? 'ok' : 'neutral'}>{STATE_LABEL[i.state]}</Badge>}</td>
              <td className="text-right">
                <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                  {canPay && i.state === 'due' && i.testMode === testGateway ? <PayNow invoiceId={i.id} /> : null}
                  <Link href={billingHref('charges', { bill: i.id })} className={button({ variant: 'ghost', size: 'sm' })}>Charges</Link>
                  <a href={`/console/settings/billing/invoice/${i.id}`} className={button({ variant: 'ghost', size: 'sm' })}>PDF</a>
                </span>
              </td>
            </DataTableRow>
          ))}
          {!keep.length ? <DataTableRow><td colSpan={5} className="text-muted-foreground">{invoices.length ? 'No invoices here.' : 'No invoices yet. The first comes on the 1st.'}</td></DataTableRow> : null}
        </DataTableBody>
      </DataTable>
    </Section>
  )
}

const METHOD: Record<string, string> = { upi: 'UPI Autopay', card: 'Card', emandate: 'Bank account (eNACH)', bank_transfer: 'Bank transfer', paylink: 'Pay link', autopay: 'Autopay' }
export const methodName = (m: string) => METHOD[m] ?? m

/** Payment (mockup § Payment): autopay on (its method, limit, next debit) or the three ways; every payment, failures too. */
export function Payment({ paying, payments, canPay, configured, supportVisit }: { paying: Paying | null; payments: PaymentRow[]; canPay: boolean; configured: boolean; supportVisit: boolean }) {
  const m = paying?.mandate
  return (
    <div className="grid items-start gap-4 md:grid-cols-2">
      <Section title="Autopay" action={<Badge tone={m ? 'ok' : 'neutral'}>{m ? 'Autopay on' : 'Autopay off'}</Badge>}>
        {!configured ? <p className="text-muted-foreground">Not open yet</p> : m ? (
          <div className="space-y-3.5">
            <dl className="grid grid-cols-2 gap-3.5">
              <div><dt className="text-label text-muted-foreground">Method</dt><dd className="font-medium">{methodName(m.method)}</dd></div>
              <div><dt className="text-label text-muted-foreground">Limit a debit</dt><dd className="font-medium"><Money paise={paise(m.max)} /></dd></div>
              <div><dt className="text-label text-muted-foreground">Next debit</dt><dd className="font-medium">{paying?.nextDebit ? <><Money paise={paise(paying.nextDebit.amount)} decimals /> · {dayMonthIN(paying.nextDebit.at)}</> : '—'}</dd></div>
              <div><dt className="text-label text-muted-foreground">Since</dt><dd className="font-medium">{dayIN(m.since)}</dd></div>
            </dl>
            {canPay ? <StopAutopay /> : null}
          </div>
        ) : canPay ? <SetUpAutopay /> : <p className="text-muted-foreground">{supportVisit ? 'Only the store’s owner or a manager can set it up.' : 'No autopay.'}</p>}
      </Section>
      <Section title="Payments">
        {payments.length ? (
          <ul>{payments.map((p, i) => (
            <li key={i} className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft py-2.5 first:border-0">
              <span className="flex flex-col"><span>{dayMonthIN(p.at)} · {methodName(p.method)}</span><span className="text-label text-muted-foreground">{p.reason ?? p.number}</span></span>
              <span className="flex items-center gap-2.5"><Money paise={paise(p.amount)} decimals /><Badge tone={p.ok ? 'ok' : 'danger'}>{p.ok ? 'Paid' : 'Failed'}</Badge></span>
            </li>))}</ul>
        ) : <p className="text-muted-foreground">No payments yet.</p>}
      </Section>
    </div>
  )
}
