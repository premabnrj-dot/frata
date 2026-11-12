'use client'

import { waLink } from '@/domains/settings/whatsapp'
import { useEffect, useRef, useState } from 'react'
import { pick, urlFor } from '@/domains/media/sizes'
import { cashAtDoor, type ShopperState } from '@/domains/orders/order-state'
import { api, dayRange, downloadInvoice, inr, type OrderRef, type Pay } from './shop-client'

type View = {
  number: number; state: ShopperState; collect: number; method: 'cod' | 'prepaid'; paidAfterSwitch: boolean; canSwitchToCod: boolean
  subtotal: number; shipping: number; codCharge: number; total: number; firstName: string; to: string; phone: string; email: string | null
  /** Offers that saved on the items (title and ₹ only). */
  savings?: { title: string; amount: number }[]
  arrives: { from: string; to: string } | null; returnDays: number | null; returnKind: string | null
  lines: { title: string; optionValues: string[]; qty: number; unitPrice: number; imageBase: string | null; imageWidths: number[] | null; kind: string }[]
  shop: { name: string; whatsapp: string }
  /** An invoice exists (the order was packed): the shopper may download it (Documents D2). */
  invoice?: boolean
}

const REF_KEY = 'frrata.order.ref.v1'

const STATE: Record<ShopperState, string> = {
  confirming: 'Placed · the shop confirms it soon', confirmed: 'Confirmed · being packed', paid: 'Paid · being packed', packed: 'Packed · ready to ship',
  awaiting_payment: 'Waiting for your payment', not_paid: 'Not paid yet', cancelled: 'Cancelled', shipped: 'On its way',
  ndr: 'Delivery attempt failed · the courier will try again', delivered: 'Delivered', returning: 'Returning to the shop', returned: 'Returned to the shop',
  delivery_problem: 'There was a problem with the delivery · the shop will contact you',
}

/**
 * The shopper's receipt at /orders#t=<token>. The token stays in the #fragment (browsers never send it, so no
 * log or cache holds it) and is POSTed in a body. Address and phone are masked (owner call 4).
 */
export function OrderView({ prefix, returnsHref }: { prefix: string; returnsHref: string }) {
  const [v, setV] = useState<View | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const tokenRef = useRef<OrderRef | null>(null)
  const [invoiceState, setInvoiceState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null })
  const getInvoice = () => {
    setInvoiceState({ busy: true, error: null })
    void downloadInvoice(tokenRef.current!).then((r) => setInvoiceState({ busy: false, error: r.ok ? null : r.error }))
  }
  // Finish paying, on this page (shop stress test 2026-11-11: the "Finish paying" email links here and promised both,
  // but the page offered neither). Online again on the same order, or Pay on delivery at the total the server prices
  // (shown on the button before it is agreed to).
  const [pay, setPay] = useState<{ busy: boolean; error: string | null; codTotal: number | null }>({ busy: false, error: null, codTotal: null })
  const load = () => api<View>('/api/shop/orders/view', tokenRef.current!).then((r) => { if (r.ok) setV(r.data); return r.ok ? r.data : null })
  async function payOnline() {
    setPay((x) => ({ ...x, busy: true, error: null }))
    const r = await api<{ pay: Pay }>('/api/shop/orders/retry', tokenRef.current!)
    if (!r.ok) { setPay((x) => ({ ...x, busy: false, error: r.data.error ?? 'Online payment could not open. Try again.' })); return }
    const { openRazorpay } = await import('./checkout-pay')
    await openRazorpay(tokenRef.current!, r.data.pay, { done: () => { setPay((x) => ({ ...x, busy: false })); void load() }, failed: (text) => setPay((x) => ({ ...x, busy: false, error: text })) })
  }
  async function payOnDelivery() {
    setPay((x) => ({ ...x, busy: true, error: null }))
    const r = await api<{ kind: 'switched' | 'paid' }>('/api/shop/orders/cod', { ...tokenRef.current!, expectedTotal: pay.codTotal ?? 0 })
    if (r.ok) { setPay({ busy: false, error: null, codTotal: null }); void load(); return }
    const codTotal = (r.data as { codTotal?: number }).codTotal
    // The first tap asks the total; the button then shows it, and the next tap agrees to it.
    if (typeof codTotal === 'number') { setPay({ busy: false, error: pay.codTotal === null ? null : r.data.error ?? null, codTotal }); return }
    setPay((x) => ({ ...x, busy: false, error: r.data.error ?? 'We could not switch to Pay on delivery. Try again.' }))
  }
  // While a payment is being confirmed, the page checks again (a reply lost on the way back from Razorpay no longer
  // leaves "Waiting for your payment" on screen for good): every 8 s, for 2 minutes.
  useEffect(() => {
    if (v?.state !== 'awaiting_payment') return
    let n = 0
    const t = window.setInterval(() => { if (++n > 15) window.clearInterval(t); else void load() }, 8000)
    return () => window.clearInterval(t)
  }, [v?.state]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // The order's own token (#t=), or an email's link (#o=&e=: bound to the address it was sent to).
    const h = new URLSearchParams(window.location.hash.slice(1)), token = h.get('t') ?? '', o = h.get('o') ?? '', e = h.get('e') ?? ''
    const ref: OrderRef | null = /^[A-Za-z0-9_-]{22}$/.test(token) ? { token } : /^[0-9a-f-]{36}$/.test(o) && /^[a-z0-9]{1,8}:[0-9a-f]{64}$/.test(e) ? { o, e } : null
    // The link's ref leaves the address bar once read (kept in this tab): the page loads Razorpay's script to pay, and a
    // third-party script can read location.href (security review 2026-11-11 LOW-1). A reload reads it back.
    const kept = (() => { try { return JSON.parse(sessionStorage.getItem(REF_KEY) ?? 'null') as OrderRef | null } catch { return null } })()
    const use = ref ?? kept
    if (!use) { setError('This order link is not complete. Open the link you saved, or message the shop.'); return }
    if (ref) { try { sessionStorage.setItem(REF_KEY, JSON.stringify(ref)) } catch { /* this page only */ } history.replaceState(null, '', location.pathname) }
    tokenRef.current = use
    const ref2 = use
    void api<View>('/api/shop/orders/view', ref2).then((r) => (r.ok ? setV(r.data) : setError(r.status === 404 ? 'We could not find this order. Check the link, or message the shop.' : r.data.error ?? 'Could not load your order.')))
  }, [])
  if (error) return <p role="alert" className="mx-auto max-w-lg px-4 py-16 text-center">{error}</p>
  if (!v) return <p className="mx-auto max-w-lg px-4 py-16 text-center text-store-sub">Loading your order…</p>
  const num = `${prefix}-${v.number}`
  const wa = waLink(v.shop.whatsapp, `Order ${num}`)
  const placed = v.state !== 'not_paid' && v.state !== 'awaiting_payment'
  // The receipt's link, rebuilt from its ref (the address bar no longer carries it).
  const link = () => { const r = tokenRef.current!; return `${location.origin}${location.pathname}#${'token' in r ? `t=${r.token}` : `o=${r.o}&e=${r.e}`}` }
  const copy = () => navigator.clipboard?.writeText(link()).then(() => setCopied(true), () => setCopied(false))
  return (
    <article className="mx-auto max-w-lg space-y-4 px-4 py-8">
      {placed && v.state !== 'cancelled' && <p className="font-medium text-store-good">✓ Order placed</p>}
      <h1 className="text-3xl" style={{ fontFamily: 'var(--store-display)' }}>{placed ? `Thank you${v.firstName ? `, ${v.firstName}` : ''}` : 'Your order'}</h1>
      <dl className="space-y-1 text-sm">
        <div className="flex justify-between gap-4"><dt>Order</dt><dd className="font-mono font-medium">{num}</dd></div>
        <div className="flex justify-between gap-4"><dt>Status</dt><dd className="text-right">{STATE[v.state]}</dd></div>
        {v.arrives && placed && <div className="flex justify-between gap-4"><dt>Arrives</dt><dd>{dayRange(v.arrives)}</dd></div>}
      </dl>
      <ul className="divide-y divide-store-line border-y border-store-line">
        {v.lines.map((l, i) => (
          <li key={i} className="flex items-center gap-3 py-3 text-sm">
            {l.imageBase && l.imageWidths ? <img src={urlFor(l.imageBase, pick(l.imageWidths, 160))} alt="" width={48} height={60} data-photo className="h-[60px] w-12 rounded-sm object-cover" /> : <span className="h-[60px] w-12 rounded-sm bg-store-chip" />}
            <span className="min-w-0 flex-1">{l.title}<span className="block text-store-sub">{[...l.optionValues, `× ${l.qty}`].join(' · ')}{l.kind === 'preorder' ? ' · pre-order' : l.kind === 'made_to_order' ? ' · made to order' : ''}</span></span>
            <span className="tabular-nums">{inr(l.unitPrice * l.qty)}</span>
          </li>
        ))}
      </ul>
      <dl className="space-y-1 text-sm">
        {(v.savings ?? []).map((s, i) => <div key={`${s.title}-${i}`} className="flex justify-between text-store-good"><dt>{s.title}</dt><dd className="tabular-nums">−{inr(s.amount)}</dd></div>)}
        <div className="flex justify-between"><dt>Delivery</dt><dd>{v.shipping ? inr(v.shipping) : 'Free'}</dd></div>
        {v.method === 'cod' && v.codCharge > 0 && <div className="flex justify-between"><dt>Pay on delivery fee</dt><dd>{inr(v.codCharge)}</dd></div>}
        <div className="flex justify-between pt-1 text-base"><dt className="font-medium">{v.collect > 0 && cashAtDoor(v.state) ? `Keep ${inr(v.collect)} ready` : v.collect > 0 && v.state === 'delivered' ? 'Paid on delivery' : v.method === 'prepaid' && v.state !== 'not_paid' && v.state !== 'awaiting_payment' ? 'Paid online' : 'Total'}</dt>
          <dd className="tabular-nums">{v.method === 'cod' ? 'cash or UPI' : inr(v.total)}</dd></div>
        {v.paidAfterSwitch && <p className="text-store-good">Your online payment went through: nothing to pay on delivery.</p>}
        <div className="flex justify-between text-store-sub"><dt>To</dt><dd>{v.to}{v.phone ? ` · phone ${v.phone}` : ''}</dd></div>
        {v.email ? <div className="flex justify-between gap-4 text-store-sub"><dt>Updates to</dt><dd className="break-all text-right">{v.email}</dd></div> : null}
      </dl>
      {v.canSwitchToCod && (v.state === 'not_paid' || v.state === 'awaiting_payment') && (
        <div className="space-y-2">
          <button type="button" onClick={() => void payOnline()} disabled={pay.busy} className="store-btn store-buy grid h-12 w-full place-items-center rounded-[var(--store-radius)] bg-store-button font-medium text-store-on-button disabled:opacity-60">{pay.busy ? 'One moment…' : `Pay ${inr(v.total)} online`}</button>
          <button type="button" onClick={() => void payOnDelivery()} disabled={pay.busy} className="grid h-12 w-full place-items-center rounded-sm border border-store-ink disabled:opacity-60">{pay.codTotal === null ? 'Pay on delivery instead' : `Pay ${inr(pay.codTotal)} on delivery`}</button>
          {pay.error && <p role="alert" className="text-sm text-store-bad">{pay.error}</p>}
        </div>
      )}
      {wa && <a href={wa} rel="noopener" className="grid h-12 place-items-center rounded-sm bg-store-ink text-store-paper">Message {v.shop.name} on WhatsApp</a>}
      {v.invoice && (
        <div>
          <button type="button" onClick={getInvoice} disabled={invoiceState.busy} className="grid h-12 w-full place-items-center rounded-sm border border-store-ink">{invoiceState.busy ? 'Making your invoice…' : 'Download invoice (PDF)'}</button>
          {invoiceState.error && <p role="alert" className="mt-1 text-sm text-store-bad">{invoiceState.error}</p>}
        </div>
      )}
      <p className="text-sm text-store-sub">Save this page: it is your receipt. <button type="button" onClick={copy} className="underline">{copied ? 'Link copied' : 'Copy link'}</button></p>
      {v.returnKind && v.returnKind !== 'none' && v.returnDays ? <p className="text-sm text-store-sub">{v.returnDays}-day {v.returnKind === 'exchange_only' ? 'exchanges' : v.returnKind === 'refund_only' ? 'returns' : 'returns and exchanges'}. <a href={returnsHref} className="underline">How returns work</a></p> : null}
    </article>
  )
}
