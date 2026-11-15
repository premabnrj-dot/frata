import { notFound } from 'next/navigation'
import { Money } from '@/components/data/numeric'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { ViewTabs } from '@/components/ui/view-tabs'
import { FieldMessage } from '@/components/ui/action-form'
import { FIELD } from '@/components/ui/field'
import { STATE_LABEL } from '@/domains/billing/status'
import { paise } from '@/domains/money/paise'
import { invoiceDetail } from '@/lib/admin/billing'
import { ADMIN_ONLY, requireStaff } from '@/lib/auth/require-staff'
import { formatInr } from '@/lib/format'
import { dayMonthIN, monthYearIN } from '@/lib/format-date'
import { DialogButton, MoreDialogs, type DialogSpec } from '../../../_components/form-dialog'
import { NeedsBand } from '../../../_components/needs-band'
import { creditAction, paymentAction, refundAction } from '../../actions'

export const metadata = { title: 'Invoice' }
const METHOD: Record<string, string> = { bank_transfer: 'Bank transfer', upi: 'UPI', card: 'Card', emandate: 'Autopay', paylink: 'Pay link' }
const TABS = [['payments', 'Payments'], ['lines', 'Lines'], ['credits', 'Credit notes']] as const
type Tab = (typeof TABS)[number][0]
const inr = (p: number) => formatInr(paise(p), { decimals: true })
/** Today in India, for the refund's "Sent on" (the definer allows the last 90 days). */
const todayIST = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10)

/** Admin › Billing › an invoice (Neel N4, board Invoice): what is due leads; payments, lines and credit notes in tabs. */
export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return <Panel title={staff.message} />
  const [{ id }, sp] = await Promise.all([params, searchParams])
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const d = await invoiceDetail(staff, id)
  if (!d || !d.invoice.number) notFound()
  const i = d.invoice
  const num = d.invoice.number
  const tab: Tab = TABS.find(([k]) => k === sp.tab)?.[0] ?? 'payments'
  const over = i.testMode ? undefined : d.payments.find((p) => p.overPaid > 0 && !p.refundedAt && p.capturedAt)
  const inv = <input type="hidden" name="invoice" value={i.id} />

  const recordPayment: DialogSpec = { label: 'Record payment…', title: `Record a payment on ${i.number}?`, action: paymentAction, confirm: true, keep: 'Don’t record', go: 'Record payment', fields: <>{inv}
    <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Amount, ₹</span><input name="rupees" inputMode="decimal" required defaultValue={(i.due / 100).toFixed(2)} className={`${FIELD} font-num`} /><FieldMessage name="rupees" /></label>
    <label className="flex flex-col gap-1 text-sm"><span className="font-medium">How</span><select name="method" className={FIELD}><option value="bank_transfer">Bank transfer</option><option value="upi">UPI</option><option value="paylink">Pay link</option><option value="card">Card</option></select></label>
    <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Reference (UTR)</span><input name="utr" required autoComplete="off" className={`${FIELD} font-mono`} /><FieldMessage name="utr" /></label></> }
  const creditNote: DialogSpec = { label: 'Issue credit note…', title: `Issue a credit note on ${i.number}?`, description: 'GST is added at the invoice’s rate. A credit note is final.', action: creditAction, confirm: true, keep: 'Don’t issue', go: 'Issue credit note', danger: true, fields: <>{inv}
    <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Taxable value to credit, ₹</span><input name="rupees" inputMode="decimal" required className={`${FIELD} font-num`} /><FieldMessage name="rupees" /></label>
    <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Reason</span><input name="reason" required minLength={3} maxLength={240} className={FIELD} /><FieldMessage name="reason" /></label></> }
  const more = [...(!i.testMode && i.state === 'due' ? [recordPayment] : []), creditNote]

  return (
    <>
      <PageHeader title={num} back={{ href: `/admin/billing?month=${i.periodStart.toISOString().slice(0, 7)}`, label: 'Billing' }}
        badges={<>{i.toRefund > 0 ? <Badge tone="danger">Paid {formatInr(paise(i.toRefund))} too much</Badge> : <Badge tone={i.state === 'due' ? 'warn' : i.state === 'paid' ? 'ok' : 'neutral'}>{i.state === 'due' ? `Due ${inr(i.due)}` : STATE_LABEL[i.state]}</Badge>}
          {i.testMode && <Badge tone="warn">Test</Badge>}</>}
        meta={`${i.shop} · ${monthYearIN(i.periodStart)} · ${inr(i.total)} with GST`}
        actions={<><MoreDialogs specs={more} /><a href={`/admin/billing/invoice/${i.id}/pdf`} className={button()}>Download PDF</a></>} />

      {over && (
        <NeedsBand tone="bad" title={`${i.shop} paid ${formatInr(paise(over.overPaid))} too much by ${METHOD[over.method] ?? over.method} on ${dayMonthIN(over.capturedAt!)}.`}
          line="Refund it to the store, then record the refund."
          action={<DialogButton spec={{ label: 'Record refund', title: `Record the ${formatInr(paise(over.overPaid))} refund to ${i.shop}?`, description: 'Record it once the money has left Frrata’s bank. It can’t be changed.', action: refundAction, confirm: true, keep: 'Not yet', go: 'Record refund',
            fields: <>{inv}<input type="hidden" name="payment" value={over.id} />
              <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Bank reference (UTR)</span><input name="utr" required pattern="[A-Za-z0-9\-]{6,40}" autoComplete="off" data-error="6 to 40 letters and digits." className={`${FIELD} font-mono`} /><FieldMessage name="utr" /></label>
              <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Sent on</span><input name="sentOn" type="date" required max={todayIST()} defaultValue={todayIST()} className={FIELD} /></label></> }} />} />
      )}

      <ViewTabs label={num} tabs={TABS.map(([k, l]) => ({ href: `/admin/billing/invoice/${i.id}?tab=${k}`, label: l, count: k === 'payments' ? d.payments.length : k === 'credits' ? d.credits.length || undefined : undefined, current: tab === k }))} />

      {tab === 'payments' && (d.payments.length === 0 ? <Panel title="No payments yet" /> : (
        <DataTable label="Payments">
          <DataTableHead><th>Received</th><th>How</th><th>Reference</th><th className="text-right">Amount</th></DataTableHead>
          <DataTableBody>
            {d.payments.map((p) => (
              <DataTableRow key={p.id}>
                <Td cell="a">{p.capturedAt ? dayMonthIN(p.capturedAt) : p.failedAt ? <span className="text-danger-text">Failed {dayMonthIN(p.failedAt)}</span> : <span className="text-muted-foreground">Waiting for the bank</span>}</Td>
                <Td cell="c">{METHOD[p.method] ?? p.method}{p.refundedAt && <span className="text-muted-foreground"> · {formatInr(paise(p.refundAmount ?? 0))} refunded {dayMonthIN(p.refundedAt)}</span>}</Td>
                <Td cell="d" className="font-mono">{p.utr ?? ''}</Td>
                <Td cell="b" className="text-right"><Money paise={paise(p.amount)} decimals /></Td>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      ))}

      {tab === 'lines' && (
        <DataTable label="Lines">
          <DataTableHead><th>Line</th><th className="text-right">Taxable</th></DataTableHead>
          <DataTableBody>
            {d.lines.map((l, k) => <DataTableRow key={k}><Td cell="a">{l.description}</Td><Td cell="b" className="text-right"><Money paise={paise(l.taxable)} decimals /></Td></DataTableRow>)}
            <DataTableRow><Td cell="a">GST</Td><Td cell="b" className="text-right"><Money paise={paise(i.gst)} decimals /></Td></DataTableRow>
            <DataTableRow><Td cell="a" className="font-semibold">Total</Td><Td cell="b" className="text-right font-semibold"><Money paise={paise(i.total)} decimals /></Td></DataTableRow>
          </DataTableBody>
        </DataTable>
      )}

      {tab === 'credits' && (d.credits.length === 0 ? <Panel title="No credit notes" /> : (
        <DataTable label="Credit notes">
          <DataTableHead><th>Credit note</th><th>Reason</th><th className="text-right">Amount</th><th><span className="sr-only">PDF</span></th></DataTableHead>
          <DataTableBody>
            {d.credits.map((c) => (
              <DataTableRow key={c.number}>
                <Td cell="a" className="font-num">{c.number}</Td><Td cell="c">{c.reason}</Td>
                <Td cell="b" className="text-right"><Money paise={paise(c.total)} decimals /></Td>
                <Td cell="e" className="md:text-right"><a href={`/admin/billing/invoice/${i.id}/pdf?credit=${encodeURIComponent(c.number)}`} className="underline-offset-2 hover:underline">PDF</a></Td>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      ))}
    </>
  )
}
