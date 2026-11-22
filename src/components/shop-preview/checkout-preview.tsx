'use client'

import { useEffect, useRef, useState } from 'react'
import { BrandFooter, BrandHeader, brandStyle, type BrandFacts } from '@/components/storefront/brand-parts'
import { BRAND_CSS } from '@/lib/storefront/brand-css'
import { TrustBlocks } from '@/components/storefront/trust-blocks'
import { dayRange, inr } from '@/components/storefront/shop-client'
import { headingOf, type CheckoutDesign, type TrustBlock } from '@/domains/brand/checkout'
import { SAMPLE_SHOPPER as S, sampleCheckout, type PreviewPage, type PreviewState, type SampleItem, type SampleRules } from '@/domains/brand/checkout-sample'
import type { BrandRecord } from '@/domains/brand/record'

// =============================================================================
// FILE: src/components/shop-preview/checkout-preview.tsx — THE CHECKOUT, ORDER, BAG-LINK AND POLICY PAGES ON SAMPLE DATA
// (one-address plan P2·5; mockup docs/mockups/2026-11-16-p2-checkout.html screen 8, "Preview"). Drawn from the brand
// frame's own parts and rules (brand-parts.tsx, brand-css.ts) and the checkout's classes, on the store's own products
// and a sample shopper (src/domains/brand/checkout-sample.ts), at the store's phone width (390), scaled to the card. It
// redraws as the draft changes; nothing in it is a control (inert). The page's words are today's checkout and order
// page words; the store's live pages are the real ones. The faces' variables come from the page around it (the editor
// sets STORE_FONT_VARS and BRAND_FONT_VARS): this chunk loads lazily and must carry no font CSS.
// =============================================================================

export type PreviewData = {
  items: SampleItem[]; rules: SampleRules; facts: BrandFacts & { returnLine: string | null }
  home: string; orderCode: string; arrives: { from: string; to: string } | null
  /** The returns policy's paragraphs as the store's policy page renders them. */
  policy: React.ReactNode
}

function Field({ label, value, opt, help, pre }: { label: string; value: string; opt?: boolean; help?: string; pre?: boolean }) {
  const box = <span className="store-field flex h-11 w-full min-w-0 items-center rounded-[var(--store-radius)] border border-store-sub/45 bg-store-paper px-3 text-base">{value}</span>
  return (
    <div className="mt-3">
      <span className="ck-label mb-1 block text-sm font-medium">{label}{opt && <span className="font-normal text-store-sub"> (optional)</span>}</span>
      {pre ? <div className="flex"><span className="store-field grid h-11 place-items-center rounded-l-[var(--store-radius)] border border-r-0 border-store-sub/45 bg-store-chip px-3 text-store-sub">+91</span>{box}</div> : box}
      {help && <p className="ck-help mt-1 text-xs text-store-sub">{help}</p>}
    </div>
  )
}

const sect = 'ck-sect mb-2 mt-6 text-xs font-semibold uppercase tracking-[0.1em] text-store-sub'

function Checkout({ d, data, trust, state }: { d: CheckoutDesign; data: PreviewData; trust: TrustBlock[]; state: PreviewState }) {
  const c = sampleCheckout(data.items, data.rules, state)
  if (!c) return <main className="ck-form mx-auto max-w-lg px-4 py-10 text-center">Your bag is empty.</main>
  const pay = (on: boolean, title: string, amount: number, line: string) => (
    <div className={`store-pay block rounded-[var(--store-radius)] border bg-store-paper p-3 ${on ? 'border-store-ink shadow-[0_0_0_1px_var(--store-ink)]' : 'border-store-line'}`}>
      <span className="flex items-center gap-2"><input type="radio" readOnly checked={on} className="accent-store-ink" /><b className="font-medium">{title}</b><span className="ml-auto tabular-nums">{inr(amount)}</span></span>
      <span className="ml-6 block text-sm text-store-sub">{line}</span>
    </div>
  )
  const btn = c.failed ? `Try paying again · ${inr(c.total)}` : c.method === 'cod' ? `Place order · ${inr(c.total)}` : `Pay · ${inr(c.total)}`
  return (
    <>
      <main className="ck-form mx-auto max-w-lg px-4 pb-6 pt-4">
        <h1 className="ck-h1 text-2xl">{headingOf(d)}</h1>
        {c.changed && <p className="mt-4 border-l-2 border-store-accent bg-store-chip px-3 py-2 text-sm">{c.changed}</p>}
        {c.failed && <p className="mt-4 border-l-2 border-store-bad bg-store-chip px-3 py-2 text-sm">Payment did not go through. Nothing was charged. Try again, or pay on delivery instead: your details are kept.</p>}
        <div className={c.failed ? 'opacity-60' : undefined}>
          <h2 className={sect}>Contact</h2>
          <Field label="Mobile number" value={S.phone} pre help="The courier calls this number to deliver." />
          <Field label="Email" value={S.email} opt help="For your order updates and invoice." />
          <h2 className={sect}>Delivery address</h2>
          <Field label="Full name" value={S.name} />
          <div className="grid grid-cols-2 gap-3"><Field label="PIN code" value={S.pincode} /><Field label="City" value={S.city} /></div>
          <Field label="House, street" value={S.house} />
          <Field label="Area, locality" value={S.area} />
          <p className="mt-1 text-sm underline">Add a landmark</p>
          <Field label="State" value={S.state} />
        </div>
        <p className="mt-4 text-sm underline">Have a code?</p>
        <h2 className={sect}>Payment</h2>
        <div className="space-y-2">
          {pay(c.method === 'prepaid', 'Pay online', c.total, 'UPI, cards, netbanking. Opens Razorpay.')}
          {c.cod ? pay(c.method === 'cod', 'Pay on delivery', c.total, 'Cash or UPI to the courier.')
            // feedback-ok: rule 5 — why Pay on delivery is not offered, on its own card (the checkout's own, drawn on sample data)
            : <div className="rounded-sm border border-store-line p-3 opacity-70"><b className="font-medium">Pay on delivery</b><p className="text-sm text-store-bad">{c.codWhy}</p></div>}
        </div>
        <h2 className={sect}>Your order</h2>
        <ul className="ck-lines">
          {c.lines.map((l, i) => (
            <li key={i} className={l.soldOut ? 'ck-line dim' : 'ck-line'}>
              {/* eslint-disable-next-line @next/next/no-img-element -- the store's own product photo, 400 px */}
              <span className="ck-ph">{l.item.photo && <img src={l.item.photo} alt="" width={56} height={84} />}</span>
              <span className="ck-tt">{l.item.title}<small>{l.item.size}</small></span>
              <span className="ck-pr">{l.soldOut ? '' : inr(l.item.price * l.qty)}</span>
              <div className="ck-ctl">{l.soldOut ? <><p className="ck-err">Sold out since you added it.</p><span className="ck-link">Remove</span></>
                : <><span className="ck-step"><button type="button" aria-label={`One fewer ${l.item.title}`}>−</button><span>{l.qty}</span><button type="button" aria-label={`One more ${l.item.title}`}>+</button></span><span className="ck-link">Remove</span></>}</div>
            </li>
          ))}
        </ul>
        <div className="mt-2 space-y-1 text-sm">
          <p className="flex justify-between"><span>Delivery</span><span>{c.shipping ? inr(c.shipping) : 'Free'}</span></p>
          {data.arrives && <p className="flex justify-between text-store-sub"><span>Arrives</span><span>{dayRange(data.arrives)}</span></p>}
          {data.facts.returnLine && <p className="flex justify-between text-store-sub"><span>Returns</span><span>{data.facts.returnLine}</span></p>}
        </div>
        <div data-online="1"><TrustBlocks blocks={trust} /></div>
        <p className="mt-4 border-t border-store-line pt-3 text-xs text-store-sub">{data.facts.legalName || data.facts.shopName} uses your name, phone and address only to deliver this order and to contact you about it. <span className="underline">Your data and how to ask for it to be deleted</span>.</p>
      </main>
      <div className="border-t border-store-line bg-store-paper px-4 pb-4 pt-3">
        <p className="flex justify-between text-sm"><span className="text-store-sub">{c.method === 'cod' ? 'Pay on delivery' : 'Pay online'}</span><b className="tabular-nums">{inr(c.total)}</b></p>
        <span className="store-btn store-buy mt-2 grid h-12 w-full place-items-center rounded-[var(--store-radius)] bg-store-button text-base font-medium text-store-on-button">{btn}</span>
      </div>
    </>
  )
}

function Order({ d, data }: { d: CheckoutDesign; data: PreviewData }) {
  const a = data.items[0]
  return (
    <main className="ck-col mx-auto max-w-lg space-y-4 px-4 py-8">
      <p className="flex items-center gap-2 font-medium text-store-good"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>Order placed</p>
      <h1 className="ck-h1 text-3xl">Thank you, {S.first}</h1>
      {d.thanks && <p className="ck-thanks">{d.thanks}</p>}
      <dl className="space-y-1 text-sm">
        <div className="flex justify-between gap-4"><dt>Order</dt><dd className="font-mono font-medium">{data.orderCode}</dd></div>
        <div className="flex justify-between gap-4"><dt>Status</dt><dd className="text-right">Placed · the shop confirms it soon</dd></div>
        {data.arrives && <div className="flex justify-between gap-4"><dt>Arrives</dt><dd>{dayRange(data.arrives)}</dd></div>}
      </dl>
      {a && <>
        <ul className="ck-lines"><li className="ck-line"><span className="ck-ph">{a.photo && <img src={a.photo} alt="" width={56} height={84} />}</span><span className="ck-tt">{a.title}<small>{a.size} · × 1</small></span><span className="ck-pr">{inr(a.price)}</span></li></ul>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between pt-1 text-base"><dt className="font-medium">Keep {inr(a.price)} ready</dt><dd>cash or UPI</dd></div>
          <div className="flex justify-between text-store-sub"><dt>To</dt><dd>{S.area}, {S.city} {S.pincode}</dd></div>
          <div className="flex justify-between gap-4 text-store-sub"><dt>Updates to</dt><dd>{S.email}</dd></div>
        </dl>
      </>}
      <span className="grid h-12 place-items-center rounded-sm bg-store-ink text-store-paper">Message {data.facts.shopName} on WhatsApp</span>
      <p className="text-sm text-store-sub">Save this page: it is your receipt. <span className="underline">Copy link</span></p>
    </main>
  )
}

/** The page at 390 px, scaled to the width it is given (the card), its height kept. */
function Fit({ children }: { children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null), inner = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState<{ s: number; h: number }>({ s: 1, h: 0 })
  useEffect(() => {
    const b = box.current, i = inner.current
    if (!b || !i || typeof ResizeObserver === 'undefined') return
    const measure = () => setFit({ s: Math.min(1, b.clientWidth / 390), h: i.offsetHeight })
    const ro = new ResizeObserver(measure); ro.observe(b); ro.observe(i); measure()
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={box} className="overflow-hidden rounded-md border border-border" style={{ height: fit.h ? Math.ceil(fit.h * fit.s) : undefined }}>
      <div ref={inner} style={{ width: 390, transform: `scale(${fit.s})`, transformOrigin: '0 0' }}>{children}</div>
    </div>
  )
}

export function CheckoutPreview({ record, design, data, trust, page, state }: { record: BrandRecord; design: CheckoutDesign; data: PreviewData; trust: TrustBlock[]; page: PreviewPage; state: PreviewState }) {
  const body = page === 'checkout' ? <Checkout d={design} data={data} trust={trust} state={state} />
    : page === 'order' ? <Order d={design} data={data} />
    : page === 'baglink' ? <div role="status" className="grid min-h-[50vh] place-items-center gap-3 px-4 py-16 text-center text-store-sub"><p>Opening checkout</p></div>
    : <main className="ck-col mx-auto max-w-3xl space-y-4 px-4 py-10 leading-relaxed"><h1 className="ck-h1 text-3xl">Returns and exchanges</h1>{data.policy}</main>
  return (
    <Fit>
      {/* Inert: a picture of the store's pages, nothing in it is a control. Every colour, face and corner is the record's. */}
      <div inert data-store-theme="" data-brand="" className="flex min-h-[640px] flex-col bg-store-paper text-store-ink" style={brandStyle(record)} data-pv={page}>
        <style dangerouslySetInnerHTML={{ __html: BRAND_CSS }} />
        <BrandHeader record={record} design={design} name={data.facts.shopName} home="#" link={page !== 'baglink'} />
        <div className="flex flex-1 flex-col">{body}</div>
        {page !== 'baglink' && <BrandFooter facts={data.facts} rows={design.rows} />}
      </div>
    </Fit>
  )
}
