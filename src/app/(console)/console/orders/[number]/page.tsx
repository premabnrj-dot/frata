import { Money } from '@/components/data/numeric'
import { Name } from '@/components/data/name'
import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { collect, paidOnline } from '@/domains/orders/amounts'
import { currentMethod, orderState, paidAfterPacking, paidAfterSwitch } from '@/domains/orders/order-state'
import { risk } from '@/domains/orders/risk'
import { CANCEL_LABEL, may, primaryAction, type CancelReason } from '@/domains/orders/work'
import { pick, urlFor } from '@/domains/media/sizes'
import { paise } from '@/domains/money/paise'
import { formatInr } from '@/lib/format'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { ModuleSlot } from '@/components/modules/slots'
import { dateTimeIN, dayMonthIN } from '@/lib/format-date'
import { orderDetail } from '@/lib/queries/order-detail'
import { orderPrefixFor } from '@/lib/queries/orders'
import { AddNote, EditContact } from '../_components/contact-and-notes'
import { eventLabel, PAYMENT, printHref, STATE } from '../_components/labels'
import { OrderActions } from '../_components/order-actions'

// =============================================================================
// FILE: src/app/(console)/console/orders/[number]/page.tsx
//
// ONE ORDER (1D·4c, docs/specs/2026-11-07-orders.md § 1D·2): the header with
// both badges and ONE primary action for its state (the rest under More), the
// risk card when it is Medium or High (reasons in words, one next step, Call
// and WhatsApp), the items as sold, the money, who it goes to (editable by
// owners and admins until packed), the team's notes and what people did. Found
// by number inside the member's own shop only. On a phone: one column, in the
// same order, the primary action fixed above the bottom bar.
// =============================================================================

export async function generateMetadata({ params }: { params: Promise<{ number: string }> }) {
  return { title: `Order ${(await params).number}` }
}

const wa = (phone: string, text: string) => `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`

export default async function OrderPage({ params }: { params: Promise<{ number: string }> }) {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  const tenantId = auth.membership.tenantId, role = auth.membership.role
  const raw = (await params).number
  const n = /^\d{1,9}$/.test(raw) ? Number(raw) : NaN
  const now = new Date()
  const [d, prefix] = await Promise.all([orderDetail(tenantId, n, now).catch((err) => { console.error('[order]', err instanceof Error ? err.name : err); return undefined }), orderPrefixFor(tenantId)])
  if (d === undefined) return <Panel title="We could not load this order">Nothing was changed. Try again in a minute.</Panel>
  // Another shop's order is the same "not found" as one that does not exist.
  if (d === null) return <Panel title="No such order in your shop">Check the number, or find it from <a href="/console/orders?tab=all" className="underline">all orders</a>.</Panel>

  const { o, lines, events, notes, facts } = d
  const label = `${prefix}-${o.number}`
  const state = orderState(o, now)
  const method = currentMethod(o)
  const r = state === 'unconfirmed' || state === 'held' ? (facts ? risk(facts) : { level: 'unknown' as const, reasons: [], next: 'The risk checks could not be read: look at the order before confirming.' }) : null
  const s = STATE[state]
  const pay = method === 'cod' ? PAYMENT.cod : o.paidAt ? PAYMENT.paid : PAYMENT.unpaid
  const owed = collect(o)
  // What a cancel would send back: what reached Razorpay (amounts.ts — after a switch the COD fee is already off).
  const refund = paidOnline(o)
  const primary = primaryAction(state)
  const can = { confirm: may('confirm', state, role), hold: may('hold', state, role), unhold: may('unhold', state, role), cancel: may('cancel', state, role), pack: may('pack', state, role), edit: may('edit', state, role), note: may('note', state, role) }
  const why = (r?.reasons.join('; ') || r?.next || '').replace(/\.$/, '')
  const riskWarning = r && (r.level === 'high' || r.level === 'unknown') ? `${r.level === 'high' ? 'High risk' : 'Risk unavailable'}: ${why}. Confirm only once you have spoken to the customer.` : null
  const history = [
    ...events.map((e) => ({ at: e.at, text: eventLabel(e, (x) => CANCEL_LABEL[x as CancelReason] ?? x), who: e.actorKind === 'support' ? `${e.actorEmail ?? ''} · Frata support` : e.actorEmail ?? 'Frata' })),
    { at: o.placedAt, text: method === 'cod' && !o.switchedToCodAt ? 'Placed · pay on delivery' : 'Placed · online', who: 'Customer' },
    ...(o.paidAt ? [{ at: o.paidAt, text: 'Paid online', who: 'Razorpay' }] : []),
    ...(o.switchedToCodAt ? [{ at: o.switchedToCodAt, text: 'Switched to pay on delivery', who: 'Customer' }] : []),
  ].sort((a, b) => b.at.getTime() - a.at.getTime())

  return (
    <>
      <PageHeader title={label} back={{ href: '/console/orders', label: 'Orders' }}
        badges={<><Badge tone={pay.tone}>{pay.label}</Badge><Badge tone={s.tone}>{s.label}</Badge></>}
        meta={<>Placed {dateTimeIN(o.placedAt)}{o.invoiceNumber ? <> · Invoice <span className="font-mono">{o.invoiceNumber}</span></> : null}</>}
        actions={<OrderActions orderId={o.id} number={label} primary={primary}
          print={{ slip: may('print', state, role) ? printHref('slip', [o.number]) : null, invoice: o.invoiceNumber ? printHref('invoice', [o.number]) : null }} riskWarning={riskWarning} heldPaid={state === 'held' && !!o.paidAt}
          may={{ hold: can.hold, unhold: can.unhold, cancel: can.cancel, pack: can.pack, confirm: can.confirm }}
          refund={refund} refundLabel={formatInr(paise(refund))} stockTaken={lines.some((l) => l.stockTakenAt)} />} />

      <div className="grid gap-6 pb-16 md:grid-cols-[minmax(0,1fr)_20rem] md:pb-0">
        <div className="min-w-0 space-y-6">
          {r && r.level !== 'low' ? (
            <Section id="risk" title={r.level === 'high' ? 'High risk' : r.level === 'medium' ? 'Medium risk' : 'Risk unavailable'}>
              {r.reasons.length ? <ul className="list-disc space-y-1 pl-5 text-sm">{r.reasons.map((x) => <li key={x}>{x}</li>)}</ul> : null}
              {r.next ? <p className="text-sm font-medium">{r.next}</p> : null}
              {o.phone ? (
                <div className="flex flex-wrap gap-2">
                  <a href={`tel:+91${o.phone}`} className="inline-flex min-h-10 items-center rounded-md border border-input px-3 text-sm md:min-h-9">Call {o.phone}</a>
                  <a href={wa(o.phone, `Hello, this is about your order ${label}. Can you confirm it, please?`)} rel="noopener" target="_blank" className="inline-flex min-h-10 items-center rounded-md border border-input px-3 text-sm md:min-h-9">WhatsApp</a>
                </div>
              ) : null}
            </Section>
          ) : null}

          <Section id="items" title="Items">
            <ul className="divide-y divide-border">
              {lines.map((l) => (
                <li key={l.id} className="flex items-center gap-3 py-3 text-sm first:pt-0">
                  {l.imageBase && l.imageWidths ? <img src={urlFor(l.imageBase, pick(l.imageWidths, 160))} alt="" width={48} height={60} className="h-[60px] w-12 rounded-sm object-cover" /> : <span aria-hidden className="h-[60px] w-12 rounded-sm bg-muted" />}
                  <span className="min-w-0 flex-1"><span className="font-medium">{l.title}</span>
                    <span className="block text-muted-foreground">{[...l.optionValues, l.sku].filter(Boolean).join(' · ')}</span>
                    {l.kind === 'preorder' ? <span className="block text-xs text-warn-text">Pre-order{l.shipsBy ? ` · ships by ${dayMonthIN(new Date(`${l.shipsBy}T00:00:00+05:30`))}` : ''}</span> : null}
                    {l.kind === 'made_to_order' ? <span className="block text-xs text-muted-foreground">Made to order · {l.leadMinDays}–{l.leadMaxDays} days</span> : null}
                  </span>
                  <span className="text-right font-mono tabular-nums">{l.qty} × <Money paise={paise(l.unitPrice)} /></span>
                </li>
              ))}
            </ul>
            <dl className="space-y-1 border-t border-border pt-3 text-sm">
              <div className="flex justify-between"><dt>Delivery</dt><dd>{o.shipping ? <Money paise={paise(o.shipping)} /> : 'Free'}</dd></div>
              {o.codCharge ? <div className="flex justify-between"><dt>Pay on delivery fee</dt><dd><Money paise={paise(o.codCharge)} /></dd></div> : null}
              <div className="flex justify-between text-muted-foreground"><dt>GST {o.pricesIncludeGst ? '(included)' : ''}</dt><dd><Money paise={paise(o.gstTotal)} /></dd></div>
              <div className="flex justify-between pt-1 font-medium"><dt>Total</dt><dd><Money paise={paise(o.total)} /></dd></div>
            </dl>
            {/* The line the courier and the packer need, in words: never only a colour. */}
            <p className="border-t border-border pt-3 text-sm font-medium">
              {paidAfterPacking(o) && state !== 'cancelled' ? <span className="text-danger-text">Paid online after it was packed for Pay on delivery. Tell the courier not to collect cash; if cash was collected too, refund the online payment in Razorpay. The invoice stays as issued: ask your CA whether it needs a credit note.</span>
                : state === 'cancelled' ? (refund ? <>Paid online, then cancelled: refund <Money paise={paise(refund)} /> in Razorpay.</> : 'Cancelled: nothing to collect.')
                : state === 'refund_due' ? <>Paid after it sold out: cancel it, then refund <Money paise={paise(refund)} /> in Razorpay.{can.cancel ? null : ' Ask an owner or admin to cancel it.'}</>
                : state === 'delivered' ? (method === 'cod' && !o.paidAt ? <>Delivered: <Money paise={paise(Number(o.total))} /> collected by the courier.</> : 'Delivered.')
                : state === 'rto' || state === 'rto_received' ? 'Returned to you: nothing was collected.'
                : paidAfterSwitch(o) ? 'Paid online — do not collect cash.'
                : owed ? <>Collect <Money paise={paise(owed)} /> on delivery.</> : o.paidAt ? 'Paid online — collect nothing.' : 'Not paid yet.'}
            </p>
          </Section>
        </div>

        <div className="min-w-0 space-y-6">
          <ModuleSlot name="order.side" ctx={{ tenantId: auth.membership.tenantId, orderId: o.id }} at={now.toISOString()} />
          <Section id="customer" title="Customer" action={can.edit && !o.erasedAt ? <EditContact orderId={o.id} number={label} contact={{ customerName: o.customerName, phone: o.phone, addressLine: o.addressLine, area: o.area, landmark: o.landmark, pincode: o.pincode, city: o.city, state: o.state }} /> : undefined}>
            {o.erasedAt ? <p className="text-sm text-muted-foreground">Removed after 90 days: this online order was never paid.</p> : (
              <div className="space-y-1 text-sm">
                <p className="font-medium">{o.customerName ? <Name>{o.customerName}</Name> : '—'}</p>
                {[o.area ? `${o.addressLine}, ${o.area}` : o.addressLine, o.landmark, `${o.city} ${o.pincode}`, o.state].filter((x) => x && x.trim()).map((x) => <p key={x}>{x}</p>)}
                {o.phone ? <p className="flex flex-wrap items-center gap-x-3 pt-1"><span className="font-mono">{o.phone}</span>
                  <a href={`tel:+91${o.phone}`} className="inline-flex min-h-6 items-center underline underline-offset-2">Call</a>
                  <a href={wa(o.phone, `Hello, this is about your order ${label}.`)} target="_blank" rel="noopener" className="inline-flex min-h-6 items-center underline underline-offset-2">WhatsApp</a></p> : null}
                {o.cancelReason ? <p className="pt-2 text-muted-foreground">Cancelled: {CANCEL_LABEL[o.cancelReason as CancelReason] ?? o.cancelReason}{o.cancelNote ? ` — ${o.cancelNote}` : ''}</p> : null}
              </div>
            )}
          </Section>

          <Section id="notes" title="Notes">
            {notes.length ? <ul className="space-y-2 text-sm">{notes.map((x) => <li key={x.id}><p className="whitespace-pre-wrap">{x.body}</p><p className="text-xs text-muted-foreground">{x.authorEmail} · {dateTimeIN(x.at)}</p></li>)}</ul> : null}
            {can.note ? <AddNote orderId={o.id} /> : notes.length ? null : <p className="text-sm text-muted-foreground">No notes.</p>}
          </Section>

          <Section id="activity" title="Activity">
            <ol className="space-y-2 text-sm">
              {history.map((h, i) => <li key={i}><p>{h.text}</p><p className="text-xs text-muted-foreground">{h.who} · {dateTimeIN(h.at)}</p></li>)}
            </ol>
          </Section>
        </div>
      </div>
    </>
  )
}
