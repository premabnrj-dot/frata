'use client'

import { useEffect, useRef, useState } from 'react'
import { pick, urlFor } from '@/domains/media/sizes'
import { cashAtDoor, type ShopperState } from '@/domains/orders/order-state'
import { api, dayRange, downloadInvoice, inr } from './shop-client'

type View = {
  number: number; state: ShopperState; collect: number; method: 'cod' | 'prepaid'; paidAfterSwitch: boolean; canSwitchToCod: boolean
  subtotal: number; shipping: number; codCharge: number; total: number; firstName: string; to: string; phone: string
  /** Offers that saved on the items (title and ₹ only). */
  savings?: { title: string; amount: number }[]
  arrives: { from: string; to: string } | null; returnDays: number | null; returnKind: string | null
  lines: { title: string; optionValues: string[]; qty: number; unitPrice: number; imageBase: string | null; imageWidths: number[] | null; kind: string }[]
  shop: { name: string; whatsapp: string }
  /** An invoice exists (the order was packed): the shopper may download it (Documents D2). */
  invoice?: boolean
}

const STATE: Record<ShopperState, string> = {
  confirming: 'Placed · the shop confirms it soon', confirmed: 'Confirmed · being packed', paid: 'Paid · being packed', packed: 'Packed · ready to ship',
  awaiting_payment: 'Waiting for your payment', not_paid: 'Not paid · the order was not placed', cancelled: 'Cancelled', shipped: 'On its way',
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
  const tokenRef = useRef('')
  const [invoiceState, setInvoiceState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null })
  const getInvoice = () => {
    setInvoiceState({ busy: true, error: null })
    void downloadInvoice(tokenRef.current).then((r) => setInvoiceState({ busy: false, error: r.ok ? null : r.error }))
  }
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('t') ?? ''
    if (!/^[A-Za-z0-9_-]{22}$/.test(token)) { setError('This order link is not complete. Open the link you saved, or message the shop.'); return }
    tokenRef.current = token
    void api<View>('/api/shop/orders/view', { token }).then((r) => (r.ok ? setV(r.data) : setError(r.status === 404 ? 'We could not find this order. Check the link, or message the shop.' : r.data.error ?? 'Could not load your order.')))
  }, [])
  if (error) return <p role="alert" className="mx-auto max-w-lg px-4 py-16 text-center">{error}</p>
  if (!v) return <p className="mx-auto max-w-lg px-4 py-16 text-center text-store-sub">Loading your order…</p>
  const num = `${prefix}-${v.number}`
  const wa = v.shop.whatsapp ? `https://wa.me/${v.shop.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Order ${num}`)}` : null
  const placed = v.state !== 'not_paid' && v.state !== 'awaiting_payment'
  const copy = () => navigator.clipboard?.writeText(window.location.href).then(() => setCopied(true), () => setCopied(false))
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
            {l.imageBase && l.imageWidths ? <img src={urlFor(l.imageBase, pick(l.imageWidths, 160))} alt="" width={48} height={60} className="h-[60px] w-12 rounded-sm object-cover" /> : <span className="h-[60px] w-12 rounded-sm bg-store-chip" />}
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
      </dl>
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
