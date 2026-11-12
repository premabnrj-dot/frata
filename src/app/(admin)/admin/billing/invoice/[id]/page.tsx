import { notFound } from 'next/navigation'
import { Money } from '@/components/data/numeric'
import { PageHeader } from '@/components/layout/page-header'
import { Panel } from '@/components/ui/panel'
import { STATE_LABEL } from '@/domains/billing/status'
import { paise } from '@/domains/money/paise'
import { invoiceDetail } from '@/lib/admin/billing'
import { ADMIN_ONLY, requireStaff } from '@/lib/auth/require-staff'
import { dateTimeIN, dayIN, monthYearIN } from '@/lib/format-date'
import { creditAction, paymentAction } from '../../actions'
import { Submit } from '@/components/ui/submit'
import { ActionForm, FieldMessage } from '@/components/ui/action-form'
import { FIELD } from '@/components/ui/field'

export const metadata = { title: 'Invoice' }
const METHOD: Record<string, string> = { bank_transfer: 'Bank transfer', upi: 'UPI', card: 'Card', emandate: 'Bank mandate', paylink: 'Pay link' }

/** Admin › Billing › one invoice (billing B2): its lines, payments and credit notes; record a payment; issue a credit note. */
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return <Panel title={staff.message} />
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const d = await invoiceDetail(staff, id)
  if (!d || !d.invoice.number) notFound()
  const i = d.invoice
  const field = FIELD
  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader title={`${i.shop} · ${i.number}`} back={{ href: `/admin/billing`, label: 'Billing' }}
        meta={`${monthYearIN(i.periodStart)} · issued ${dayIN(i.issuedAt!)}${i.testMode ? ' · TEST — not a tax invoice, never collected' : ''}`} />
      <Panel title={i.state === 'due' ? `Due ${(i.due / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}` : STATE_LABEL[i.state]}>
        <table className="w-full text-sm"><tbody>
          {d.lines.map((l, k) => <tr key={k} className="border-t border-border"><td className="py-1.5 pr-3">{l.description}</td><td className="py-1.5 text-right"><Money paise={paise(l.taxable)} decimals /></td></tr>)}
          <tr className="border-t border-border"><td className="py-1.5">GST</td><td className="py-1.5 text-right"><Money paise={paise(i.gst)} decimals /></td></tr>
          <tr className="border-t border-border font-semibold"><td className="py-1.5">Total</td><td className="py-1.5 text-right"><Money paise={paise(i.total)} decimals /></td></tr>
        </tbody></table>
        <p className="mt-2 text-sm"><a href={`/admin/billing/invoice/${i.id}/pdf`} className="underline">Download the PDF</a></p>
      </Panel>
      <Panel title="Payments">
        {d.payments.length === 0 ? <p className="text-sm text-muted-foreground">None yet.</p> : (
          <ul className="space-y-1 text-sm">{d.payments.map((p, k) => <li key={k}><Money paise={paise(p.amount)} decimals /> · {METHOD[p.method] ?? p.method}{p.utr ? <> · <span className="font-mono">{p.utr}</span></> : null} · {p.capturedAt ? `received ${dateTimeIN(p.capturedAt)}` : p.failedAt ? `failed ${dateTimeIN(p.failedAt)}${p.failureReason ? `: ${p.failureReason}` : ''}` : 'waiting for the bank'}{/* feedback-ok: a state of the payment (over-paid, refund it), not the result of a button */}{p.overPaid > 0 && <span className="text-danger-text"> · over-paid by <Money paise={paise(p.overPaid)} decimals />: refund it</span>}</li>)}</ul>
        )}
        {i.testMode ? <p className="mt-2 text-sm text-muted-foreground">A test invoice is never collected by hand.</p> : i.state === 'due' && (
          <ActionForm action={paymentAction} className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="invoice" value={i.id} />
            <label className="flex flex-col gap-1.5 text-sm font-medium">Amount, ₹<input name="rupees" inputMode="decimal" defaultValue={(i.due / 100).toFixed(2)} className={`${field} w-32`} /></label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">How<select name="method" className={field}><option value="bank_transfer">Bank transfer</option><option value="upi">UPI</option><option value="paylink">Pay link</option><option value="card">Card</option></select></label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">Reference (UTR)<input name="utr" autoComplete="off" className={`${field} font-mono`} /><FieldMessage name="utr" /></label>
            <Submit>Record payment</Submit>
          </ActionForm>
        )}
      </Panel>
      <Panel title="Credit notes">
        {d.credits.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : (
          <ul className="space-y-1 text-sm">{d.credits.map((c) => <li key={c.number}><span className="font-mono">{c.number}</span> · <Money paise={paise(c.total)} decimals /> · {c.reason} · <a href={`/admin/billing/invoice/${i.id}/pdf?credit=${encodeURIComponent(c.number)}`} className="underline">PDF</a></li>)}</ul>
        )}
        <ActionForm action={creditAction} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="invoice" value={i.id} />
          <label className="flex flex-col gap-1.5 text-sm font-medium">Taxable value to credit, ₹<input name="rupees" inputMode="decimal" className={`${field} w-32`} /></label>
          <label className="flex grow flex-col gap-1.5 text-sm font-medium">Reason (on the credit note)<input name="reason" maxLength={240} className={field} /></label>
          <Submit variant="secondary">Issue credit note</Submit>
        </ActionForm>
        <p className="mt-1 text-xs text-muted-foreground">GST is added at the invoice&apos;s rate. A credit note is final, and can never exceed what the invoice holds.</p>
      </Panel>
    </div>
  )
}
