import Link from 'next/link'
import { Section } from '@/components/layout/section'
import { Money } from '@/components/data/numeric'
import { DataTable, DataTableBody, DataTableHead, DataTableRow } from '@/components/data/data-table'
import { Badge } from '@/components/ui/badge'
import { button } from '@/components/ui/button'
import { STATE_LABEL } from '@/domains/billing/status'
import { paise } from '@/domains/money/paise'
import { dayIN, dayMonthIN, monthYearIN } from '@/lib/format-date'
import type { BillingOverview, Paying, PaymentRow } from '@/lib/queries/billing'
import { PayNow, SetUpAutopay, SetUpAutopayDialog, StopAutopay } from '../autopay'
import { billingHref } from './tabs'
import { BillPicks } from './pills'
import { Empty, NoMatch } from '@/components/ui/empty'

export const INVOICE_FILTERS = [['all', 'All'], ['due', 'Due'], ['paid', 'Paid'], ['credit', 'Credit notes']] as const
export type InvoiceFilter = (typeof INVOICE_FILTERS)[number][0]
export const filterOf = (v: unknown): InvoiceFilter => (INVOICE_FILTERS.some(([k]) => k === v) ? (v as InvoiceFilter) : 'all')

type Inv = BillingOverview['invoices'][number]

/** Invoices (mockup § Invoices): filter, pay what is due, trace a bill to its charges, download its PDF. */
export function Invoices({ invoices, show, canPay, testGateway }: { invoices: Inv[]; show: InvoiceFilter; canPay: boolean; testGateway: boolean }) {
  const keep = invoices.filter((i) => show === 'all' || (show === 'due' ? i.state === 'due' : show === 'paid' ? i.state === 'paid' : i.credits.length > 0))
  const docs = (i: Inv) => show === 'credit' ? [] : [i]
  return (
    <Section ariaLabel="Invoices">
      <div className="mb-3"><BillPicks label="Show" items={INVOICE_FILTERS.map(([k, l]) => ({ href: billingHref('invoices', { show: k === 'all' ? undefined : k }), label: l, current: show === k }))} /></div>
      <DataTable label="Invoices">
        <DataTableHead><th>Month</th><th>Number</th><th className="text-right">Amount</th><th>Status</th><th><span className="sr-only">Actions</span></th></DataTableHead>
        <DataTableBody>
          {keep.flatMap((i) => [...docs(i).map((i) => (
            <DataTableRow key={i.id}>
              <td data-cell="a">{monthYearIN(i.periodStart)}</td>
              <td data-cell="c" className="font-mono text-label">{i.number}</td>
              <td data-cell="b" className="text-right"><Money paise={paise(i.total)} decimals /></td>
              <td data-cell="d">{i.testMode ? <Badge tone="neutral">Test · {STATE_LABEL[i.state].toLowerCase()}</Badge>
                : i.state === 'due' ? <Badge tone="warn">Due <Money paise={paise(i.due)} decimals /></Badge> : <Badge tone={i.state === 'paid' ? 'ok' : 'neutral'}>{STATE_LABEL[i.state]}</Badge>}</td>
              <td data-cell="e" className="text-right">
                <span className="inline-flex flex-wrap items-center gap-1.5 md:justify-end">
                  {canPay && i.state === 'due' && i.testMode === testGateway ? <PayNow invoiceId={i.id} /> : null}
                  <Link href={billingHref('charges', { bill: i.id })} className={button({ variant: 'ghost', size: 'sm' })}>See charges</Link>
                  <a href={`/console/settings/billing/invoice/${i.id}`} className={button({ variant: 'ghost', size: 'sm' })}>Download PDF</a>
                </span>
              </td>
            </DataTableRow>
          )), ...i.credits.map((c) => (
            // A credit note: its own row, the amount taken off (frata-design-language § Plan and billing).
            <DataTableRow key={c.number}>
              <td data-cell="a">{monthYearIN(i.periodStart)}</td>
              <td data-cell="c" className="font-mono text-label"><a href={`/console/settings/billing/invoice/${i.id}?credit=${encodeURIComponent(c.number)}`} className={button({ variant: 'link' })}>{c.number}</a></td>
              <td data-cell="b" className="text-right">−<Money paise={paise(c.total)} decimals /></td>
              <td data-cell="d"><Badge tone="neutral">Credit note</Badge></td>
              <td data-cell="e" className="text-right"><a href={`/console/settings/billing/invoice/${i.id}?credit=${encodeURIComponent(c.number)}`} className={button({ variant: 'ghost', size: 'sm' })}>Download PDF</a></td>
            </DataTableRow>
          ))])}
        </DataTableBody>
      </DataTable>
      {!keep.length ? (invoices.length ? <NoMatch className="mt-3" title="No invoices here" /> : <Empty className="mt-3" title="No invoices yet. The first comes on the 1st." />) : null}
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
        {!configured ? <p className="text-muted-foreground">Autopay isn’t ready yet. Pay from Invoices.</p> : m ? (
          <div className="space-y-3.5">
            <dl className="grid grid-cols-2 gap-3.5">
              <div><dt className="text-label text-muted-foreground">Method</dt><dd className="font-medium">{methodName(m.method)}</dd></div>
              <div><dt className="text-label text-muted-foreground">Most per debit</dt><dd className="font-medium"><Money paise={paise(m.max)} /></dd></div>
              <div><dt className="text-label text-muted-foreground">Next debit</dt><dd className="font-medium">{paying?.nextDebit ? <><Money paise={paise(paying.nextDebit.amount)} decimals /> · {dayMonthIN(paying.nextDebit.at)}</> : '—'}</dd></div>
              <div><dt className="text-label text-muted-foreground">Since</dt><dd className="font-medium">{dayIN(m.since)}</dd></div>
            </dl>
            {canPay ? <div className="flex flex-wrap gap-2"><SetUpAutopayDialog label="Change method" variant="secondary" /><StopAutopay /></div> : null}
          </div>
        ) : canPay ? <div className="space-y-2"><SetUpAutopay /><p className="text-label text-muted-foreground">Without autopay, pay each bill from Invoices.</p></div> : <p className="text-muted-foreground">{supportVisit ? 'Only the store’s owner or a manager can set it up.' : 'No autopay.'}</p>}
      </Section>
      <Section title="Payments">
        {payments.length ? (
          <ul>{payments.map((p, i) => (
            <li key={i} className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft py-2.5 first:border-0">
              <span className="flex flex-col"><span>{dayMonthIN(p.at)} · {methodName(p.method)}</span><span className="text-label text-muted-foreground">{p.reason ?? p.number}</span></span>
              <span className="flex items-center gap-2.5"><Money paise={paise(p.amount)} decimals /><Badge tone={p.ok ? 'ok' : 'danger'}>{p.ok ? 'Paid' : 'Failed'}</Badge></span>
            </li>))}</ul>
        ) : <Empty title="No payments yet" />}
      </Section>
    </div>
  )
}
