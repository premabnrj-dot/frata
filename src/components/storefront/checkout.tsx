'use client'

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { STATES } from '@/domains/checkout/state-names'
import { announcePlaced, moduleArm, usePrefill } from './module-events'
import { waOptInText } from '@/domains/checkout/opt-in'
import { cleanGstin } from '@/domains/tax/gstin-clean'
import type { Biz, BizCheck } from './checkout-biz'
import { pick, urlFor } from '@/domains/media/sizes'
import { OfferProgress, OfferRows, useQuote } from './bag'
import { ATTR_KEY, bag, offerCode, useBag, useOfferCode } from './bag-store'
import { fitKey, shownQuote } from '@/domains/checkout/fitted'
import { api, codWhyNotText, dayRange, inr, type Pay, type PublicListed, type PublicQuote } from './shop-client'

// =============================================================================
// ONE-PAGE CHECKOUT (checkout spec § Design, mockup approved 2026-11-07).
// Phone → address → payment → review → Place order, one column, labels above,
// 7 fields, no account, no OTP. The two payment cards carry equal weight and
// their own totals; neither is selected (owner call 1). The server prices
// everything; a changed total is shown and needs a fresh tap.
// =============================================================================

type Form = { phone: string; email: string; name: string; pincode: string; city: string; addressLine: string; area: string; landmark: string; state: string }
const EMPTY: Form = { phone: '', email: '', name: '', pincode: '', city: '', addressLine: '', area: '', landmark: '', state: '' }
const FORM_KEY = 'frata.checkout.v1', PENDING_KEY = 'frata.pending.v1', FILLED_KEY = 'frrata.checkout.filled.v1'
const ss = { get: (k: string) => { try { return sessionStorage.getItem(k) } catch { return null } }, set: (k: string, v: string) => { try { sessionStorage.setItem(k, v) } catch { /* page only */ } }, del: (k: string) => { try { sessionStorage.removeItem(k) } catch { /* */ } } }
const randomKey = () => { const b = new Uint8Array(16); crypto.getRandomValues(b); return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }

// Its own chunk: only a shop that offers GST invoices shows it (checkout's first-load budget).
const CheckoutBiz = lazy(() => import('./checkout-biz'))

/** What a listed offer says it needs, in the shopper's words (the server decides; this only phrases it). */
function needText(n: PublicListed['need']): string {
  if (!n) return 'Applied'
  if (n.kind === 'add') return `Add ${inr(n.amount)} more`
  if (n.kind === 'add_items') return `Add ${n.n} more ${n.n === 1 ? 'piece' : 'pieces'}`
  if (n.kind === 'gift') return 'Your free gift: add it to the bag'
  if (n.kind === 'first_order') return 'For your first order'
  if (n.kind === 'pay_on_delivery') return 'When you pay on delivery'
  return 'When you pay online'
}

export function Checkout({ shopName, legalName, privacyHref, returnLine, gst = { deliversWithin: null, b2b: false }, waOptIn = false, identity }: { shopName: string; legalName: string; privacyHref: string; returnLine: string | null
  /** GST (plan 2026-11-09-gst-core-and-categories): a shop without a regular GSTIN delivers within its state; business buyers may ask for a GST invoice. */
  gst?: { deliversWithin: string | null; b2b: boolean }
  /** Show the WhatsApp opt-in (the shop has WhatsApp connected): unticked, naming the shop. */
  waOptIn?: boolean
  /** What a module puts above the form (slot checkout.identity: EkCode's button or its signed-in strip). */
  identity?: React.ReactNode }) {
  const [biz, setBiz] = useState<Biz>({ on: false, gstin: '', name: '' })
  const bizCheck = useRef<BizCheck | null>(null)
  const registerBiz = useCallback((c: BizCheck) => { bizCheck.current = c }, [])
  const [f, setF] = useState<Form>(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [method, setMethod] = useState<'cod' | 'prepaid' | null>(null)
  const firstMethod = useRef<'cod' | 'prepaid' | null>(null)
  const [landmark, setLandmark] = useState(false)
  const [busy, setBusy] = useState(false)
  const [optIn, setOptIn] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'error' | 'changed'; text: string } | null>(null)
  const [failed, setFailed] = useState<{ token: string; total: number } | null>(null)
  // The Pay on delivery total of the order already placed, when the server says it differs from the bag's (an offer ran
  // out or ended during the hold): shown first, then sent as the total the shopper agreed to.
  const [codTotal, setCodTotal] = useState<number | null>(null)
  const { q: live, online, error: quoteError, refresh } = useQuote(f.pincode)
  // The price the server gave THIS phone (a 409 "changed" from placement), shown and sent until the bag, phone, pincode
  // or code changes (src/domains/checkout/fitted.ts; shop stress test 2026-11-11).
  const items = useBag()
  const code = useOfferCode()
  const [fitted, setFitted] = useState<{ key: string; quote: PublicQuote } | null>(null)
  const q = shownQuote(fitted, fitKey(items, f.phone, f.pincode, code), live)
  const seen = useRef<PublicQuote | null>(null)
  const attempt = useRef<{ sig: string; key: string } | null>(null)

  // Restore what was typed (this tab only); a pending online order goes to its own page. It never did (the key was
  // written and never read): a reload in Instagram's browser after the switch to the UPI app, or Back then Forward,
  // placed the bag again as a NEW order, a second Razorpay order and a possible second charge (shop stress test
  // 2026-11-11). Its page pays it (online again, or on delivery) and checks while a payment is on its way.
  useEffect(() => {
    // Only for the bag it was placed with: a shopper who left the payment, changed the bag and came back is placing a
    // new order, and keeps that bag.
    let pending: { t?: unknown; b?: unknown } | null = null
    try { pending = JSON.parse(ss.get(PENDING_KEY) ?? 'null') } catch { /* an older value: ignored */ }
    if (pending && typeof pending.t === 'string' && /^[A-Za-z0-9_-]{22}$/.test(pending.t)) {
      ss.del(PENDING_KEY)
      if (pending.b === JSON.stringify(bag.get())) {
        // The order holds this bag now: the bag is emptied so it can't be placed twice, and the typed form goes with it
        // (as after any placed order: security review Info).
        bag.clear(); ss.del(FORM_KEY)
        window.location.replace(`/orders#t=${pending.t}`)
        return
      }
    }
    try { const saved = JSON.parse(ss.get(FORM_KEY) ?? 'null'); if (saved) setF({ ...EMPTY, ...saved }) } catch { /* */ }
  }, [])
  useEffect(() => { ss.set(FORM_KEY, JSON.stringify(f)) }, [f])
  usePrefill(EMPTY, setF)
  useEffect(() => { if (q && !seen.current) seen.current = q }, [q])
  const set = (k: keyof Form, v: string) => { setF((x) => ({ ...x, [k]: v })); setErrors((e) => { const n = { ...e }; delete n[k]; return n }) }

  // City and state from the pincode, when the directory knows it (no delivery promise). A new pincode replaces what the
  // OLD pincode filled in (the state decides the place of supply, so GST, and where a shop that delivers within its
  // state can deliver); what the shopper chose stays. A pincode the directory doesn't know clears an autofilled state,
  // so the shopper picks it. Before, both were filled only when empty, so a changed pincode kept the old state (shop
  // stress test 2026-11-11). What was autofilled is remembered with the restored form (this tab only).
  const filled = useRef<{ city: string; state: string }>({ city: '', state: '' })
  useEffect(() => { try { filled.current = { city: '', state: '', ...JSON.parse(ss.get(FILLED_KEY) ?? '{}') } } catch { /* */ } }, [])
  useEffect(() => {
    if (!/^[1-9][0-9]{5}$/.test(f.pincode)) return
    let gone = false
    void api<{ city: string | null; state: string | null }>('/api/shop/pincode', { pincode: f.pincode }).then((r) => {
      if (gone || !r.ok) return
      const city = r.data.city ?? '', state = r.data.state ?? ''
      setF((x) => ({
        ...x,
        city: !x.city || x.city === filled.current.city ? city || (x.city === filled.current.city ? '' : x.city) : x.city,
        state: !x.state || x.state === filled.current.state ? state || (x.state === filled.current.state ? '' : x.state) : x.state,
      }))
      filled.current = { city, state }
      ss.set(FILLED_KEY, JSON.stringify(filled.current))
    })
    return () => { gone = true }
  }, [f.pincode])

  // Before a choice, the total of the way the shopper can actually pay: when online payment isn't offered here, the
  // Pay on delivery total, never the online price (full e2e 2026-11-11: ₹2,191 shown, ₹2,290 the only option).
  const total = q ? (method === 'cod' ? q.cod?.total ?? 0 : method === 'prepaid' || online || !q.cod ? q.prepaid : q.cod.total) : 0
  const codOk = !!q?.cod
  // The pay-online saving, said on both cards (never a COD surcharge: drip-pricing rule, spec § Rules): what paying
  // online really saves, from the server (less than the saving when it replaces an order offer paying on delivery keeps).
  const saving = online && q?.savesOnline ? { amount: q.savesOnline } : null
  const [typing, setTyping] = useState(false)
  const [draftCode, setDraftCode] = useState('')
  const lines = q?.lines.filter((l) => l.qty > 0) ?? []

  // Online payment is not offered on this address (D1·8): a choice made before the quote said so is undone.
  useEffect(() => { if (!online && method === 'prepaid') setMethod(null) }, [online, method])
  // Pay on delivery no longer offered on this price (say a lost first-order offer took it over the COD limit): undo the
  // choice, never "Place order · ₹0" (impact review 2026-11-11).
  useEffect(() => { if (q && !q.cod && method === 'cod') setMethod(null) }, [q, method])
  const choose = (m: 'cod' | 'prepaid') => { if (!firstMethod.current) firstMethod.current = m; setMethod(m); setMsg(null) }

  async function check(): Promise<boolean> {
    const { formErrors } = await import('./checkout-place')
    const e = formErrors(f, gst.deliversWithin, biz.on ? bizCheck.current?.(biz, f.state) ?? null : null)
    setErrors(e)
    if (Object.keys(e).length) { document.getElementById(Object.keys(e)[0]!)?.focus(); return false }
    return true
  }

  async function place() {
    if (!q || !method || busy) return
    if (!(await check())) return
    setBusy(true); setMsg(null)
    const items = bag.get()
    const sig = JSON.stringify([items, method, f.phone, code, biz.on ? cleanGstin(biz.gstin) : null])
    if (!attempt.current || attempt.current.sig !== sig) attempt.current = { sig, key: randomKey() }
    let attribution: Record<string, string> = {}
    try { attribution = JSON.parse(ss.get(ATTR_KEY) ?? '{}') } catch { /* */ }
    const ek = moduleArm('ekcode')
    const r = await api<{ token: string; method: 'cod' | 'prepaid'; total: number; pay: Pay | null; payError: string | null }>('/api/shop/orders', {
      idempotencyKey: attempt.current.key, bag: items, method, expectedTotal: total, ...(code ? { code, via: offerCode.via() } : {}),
      address: { phone: f.phone, email: f.email, name: f.name, pincode: f.pincode, addressLine: f.addressLine, area: f.area, landmark: f.landmark, city: f.city, state: f.state },
      facts: { firstMethod: firstMethod.current, attribution, ...(ek ? { ekcode: ek } : {}) },
      ...(gst.b2b && biz.on ? { b2b: { gstin: cleanGstin(biz.gstin), name: biz.name.trim() } } : {}),
      ...(waOptIn && optIn ? { waOptIn: true } : {}),
    })
    if (!r.ok) {
      setBusy(false)
      // Only a "changed" is a new price to show; a refusal that carries a quote says its own words (impact review).
      if (r.data.changed && r.data.quote) {
        const { changedText } = await import('./checkout-place')
        setMsg({ tone: 'changed', text: changedText(seen.current, r.data.quote) })
        // Sold-out and gone lines leave the bag too: checkout hides a line it can't sell, so one left in the bag was
        // refused on every tap with no way to remove it here (shop stress test 2026-11-11).
        bag.reconcile(r.data.quote.lines.filter((l) => l.problem), r.data.quote.missing)
        // Keyed by the bag as it is now: when reconcile took lines out, the placement quote (priced with them) is not this
        // bag's, and the next tap re-prices.
        setFitted({ key: fitKey(bag.get(), f.phone, f.pincode, code), quote: r.data.quote })
        seen.current = r.data.quote; await refresh()
        return
      }
      if (r.data.fields) setErrors(Object.fromEntries(Object.entries(r.data.fields).map(([k, v]) => [k.replace(/^address\./, ''), v])))
      setMsg({ tone: 'error', text: r.data.error ?? 'We could not place the order. Nothing was charged. Try again.' })
      return
    }
    seen.current = q
    if (r.data.method === 'cod') return done(r.data.token)
    ss.set(PENDING_KEY, JSON.stringify({ t: r.data.token, b: JSON.stringify(items) }))
    if (!r.data.pay) { setBusy(false); setFailed({ token: r.data.token, total: r.data.total }); setMsg({ tone: 'error', text: `${r.data.payError ?? 'Online payment is not working right now.'} Your order is kept: pay on delivery instead, or try again in a minute.` }); return }
    await openPay(r.data.token, r.data.pay)
  }

  async function openPay(token: string, pay: Pay) {
    const fail = (text: string) => { setBusy(false); setFailed({ token, total: pay.amount }); setMsg({ tone: 'error', text }) }
    try { const { openRazorpay } = await import('./checkout-pay'); await openRazorpay({ token }, pay, { done: () => done(token), failed: fail }) }
    catch { fail('Online payment could not open. Check your connection, or pay on delivery instead.') }
  }

  async function retry() {
    if (!failed) return
    setBusy(true); setMsg(null)
    const r = await api<{ pay: Pay }>('/api/shop/orders/retry', { token: failed.token })
    if (!r.ok) { setBusy(false); setMsg({ tone: 'error', text: r.data.error ?? 'Online payment is not working right now.' }); return }
    await openPay(failed.token, r.data.pay)
  }

  async function switchToCod() {
    if (!failed || !q?.cod) return
    setBusy(true); setMsg(null)
    const r = await api<{ kind: 'switched' | 'paid' }>('/api/shop/orders/cod', { token: failed.token, expectedTotal: codTotal ?? q.cod.total })
    setBusy(false)
    if (r.ok) return done(failed.token)
    if (typeof r.data.codTotal === 'number') { setCodTotal(r.data.codTotal); setMsg({ tone: 'changed', text: `Pay on delivery for this order is ${inr(r.data.codTotal)}. Tap again to confirm.` }); return }
    if (r.data.quote) { const { changedText } = await import('./checkout-place'); setMsg({ tone: 'changed', text: changedText(seen.current, r.data.quote) }); await refresh(); return }
    setMsg({ tone: 'error', text: r.data.error ?? 'We could not switch to Pay on delivery. Try again.' })
  }

  function done(token: string) {
    announcePlaced({ addressLine: f.addressLine, area: f.area, landmark: f.landmark, city: f.city, state: f.state, pincode: f.pincode })
    bag.clear(); ss.del(FORM_KEY); ss.del(PENDING_KEY)
    // One purchase for the visit beacon (src/beacon/fe.ts), read once on the order page: never the order or its token.
    ss.set('fe.p', '1')
    window.location.assign(`/orders#t=${token}`)
  }

  const field = 'store-field h-11 w-full rounded-[var(--store-radius)] border border-store-sub/45 bg-store-paper px-3 text-base aria-invalid:border-store-bad'
  const Err = ({ k }: { k: string }) => (errors[k] ? <p id={`${k}-err`} className="mt-1 text-sm text-store-bad">{errors[k]}</p> : null)
  const label = 'mb-1 block text-sm font-medium'
  const sect = 'mb-2 mt-6 text-xs font-semibold uppercase tracking-[0.1em] text-store-sub'
  const button = useMemo(() => {
    if (!q || q.empty) return 'Nothing to pay for'
    if (failed) return method === 'cod' ? `Pay on delivery · ${inr(codTotal ?? q.cod?.total ?? 0)}` : `Try paying again · ${inr(failed.total)}`
    if (!method) return 'Choose how to pay'
    return method === 'cod' ? `Place order · ${inr(total)}` : `Pay · ${inr(total)}`
  }, [q, method, total, failed])

  if (q && q.empty && !lines.length) return <p className="py-10 text-center">Your bag is empty. <a href="/products" className="underline">See what is new</a></p>

  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); if (failed) return method === 'cod' ? void switchToCod() : void retry(); void place() }} className="mx-auto max-w-lg px-4 pb-40 pt-4 sm:px-0">
      <h1 className="text-2xl" style={{ fontFamily: 'var(--store-display)' }}>Checkout</h1>
      {msg && <p role="alert" className={`mt-4 border-l-2 px-3 py-2 text-sm ${msg.tone === 'changed' ? 'border-store-accent bg-store-chip' : 'border-store-bad bg-store-chip'}`}>{msg.text}</p>}
      {quoteError && <p role="alert" className="mt-4 text-sm text-store-bad">{quoteError}</p>}
      {identity && <div className="mt-4 grid gap-3">{identity}</div>}

      <fieldset disabled={!!failed} className="disabled:opacity-60">
        <h2 className={sect}>Contact</h2>
        <label htmlFor="phone" className={label}>Mobile number</label>
        <div className="flex"><span className="store-field grid h-11 place-items-center rounded-l-[var(--store-radius)] border border-r-0 border-store-sub/45 bg-store-chip px-3 text-store-sub">+91</span>
          <input id="phone" inputMode="tel" autoComplete="tel-national" value={f.phone} onChange={(e) => set('phone', e.target.value)} aria-invalid={!!errors.phone || undefined} aria-describedby="phone-help phone-err" className={`${field} rounded-l-none`} /></div>
        <p id="phone-help" className="mt-1 text-xs text-store-sub">The courier calls this number to deliver.</p><Err k="phone" />
        <label htmlFor="email" className={`${label} mt-3`}>Email <span className="font-normal text-store-sub">(optional)</span></label>
        <input id="email" type="email" inputMode="email" autoComplete="email" maxLength={254} value={f.email} onChange={(e) => set('email', e.target.value)} aria-invalid={!!errors.email || undefined} aria-describedby="email-help email-err" className={field} />
        <p id="email-help" className="mt-1 text-xs text-store-sub">For your order updates and invoice.</p><Err k="email" />

        <h2 className={sect}>Delivery address</h2>
        <div className="space-y-3">
          <div><label htmlFor="name" className={label}>Full name</label><input id="name" autoComplete="name" value={f.name} onChange={(e) => set('name', e.target.value)} aria-invalid={!!errors.name || undefined} aria-describedby="name-err" className={field} /><Err k="name" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label htmlFor="pincode" className={label}>Pincode</label><input id="pincode" inputMode="numeric" autoComplete="postal-code" maxLength={6} value={f.pincode} onChange={(e) => set('pincode', e.target.value.replace(/\D/g, ''))} aria-invalid={!!errors.pincode || undefined} aria-describedby="pincode-err" className={field} /><Err k="pincode" /></div>
            <div><label htmlFor="city" className={label}>City</label><input id="city" autoComplete="address-level2" value={f.city} onChange={(e) => set('city', e.target.value)} aria-invalid={!!errors.city || undefined} aria-describedby="city-err" className={field} /><Err k="city" /></div>
          </div>
          <div><label htmlFor="addressLine" className={label}>House, street</label><input id="addressLine" autoComplete="address-line1" value={f.addressLine} onChange={(e) => set('addressLine', e.target.value)} aria-invalid={!!errors.addressLine || undefined} aria-describedby="addressLine-err" className={field} /><Err k="addressLine" /></div>
          <div><label htmlFor="area" className={label}>Area, locality</label><input id="area" autoComplete="address-line2" value={f.area} onChange={(e) => set('area', e.target.value)} aria-invalid={!!errors.area || undefined} aria-describedby="area-err" className={field} /><Err k="area" />
            {!landmark && !f.landmark ? <button type="button" className="mt-1 text-sm underline" onClick={() => setLandmark(true)}>Add a landmark</button>
              : <div className="mt-3"><label htmlFor="landmark" className={label}>Landmark <span className="font-normal text-store-sub">(optional)</span></label><input id="landmark" value={f.landmark} maxLength={80} onChange={(e) => set('landmark', e.target.value)} className={field} /></div>}</div>
          <div><label htmlFor="state" className={label}>State</label>
            <select id="state" autoComplete="address-level1" value={f.state} onChange={(e) => set('state', e.target.value)} aria-invalid={!!errors.state || undefined} aria-describedby="state-err" className={field}>
              <option value="">Choose…</option>{STATES.map((s) => <option key={s}>{s}</option>)}</select>

            <Err k="state" /></div>
        </div>
        {gst.deliversWithin && f.state && f.state !== gst.deliversWithin && !errors.state ? <p className="text-sm text-store-bad">This shop delivers within {gst.deliversWithin} only.</p> : null}
      </fieldset>

      {gst.b2b ? (
        <Suspense fallback={null}>
          <CheckoutBiz biz={biz} setBiz={setBiz} errors={errors} register={registerBiz} field={field} label={label} err={(k) => <Err k={k} />}
            clear={(k) => setErrors((x) => { const n = { ...x }; delete n[k]; return n })} />
        </Suspense>
      ) : null}

      {q && (q.offers.listed.length > 0 || code || typing) ? <>
        <h2 className={sect}>Offers</h2>
        <ul className="space-y-2 text-sm" aria-label="Offers for this bag">
          {q.offers.listed.map((l) => (
            <li key={`${l.title}-${l.code ?? ''}`} className={`flex items-center gap-2 rounded-sm border p-2.5 ${l.applied ? 'border-store-good' : 'border-dashed border-store-line'}`}>
              <span aria-hidden className={l.applied ? 'text-store-good' : 'text-store-sub'}>{l.applied ? '✓' : '○'}</span>
              <span className="min-w-0 flex-1"><b className="font-medium">{l.title}</b>{l.code ? <span className="ml-1.5 rounded-sm border border-store-line px-1 font-mono text-xs">{l.code}</span> : null}
                <span className="block text-store-sub">{needText(l.need)}</span></span>
              {l.need?.kind === 'gift' ? <button type="button" className="min-h-11 shrink-0 rounded-sm border border-store-ink px-3 text-sm font-medium" onClick={() => bag.add((l.need as { variantId: string }).variantId, 1)}>Add it</button> : null}
            </li>
          ))}
        </ul>
      </> : null}
      {q && <OfferProgress q={q} />}
      {q && (code ? (
        <p className="mt-2 text-sm" aria-live="polite">Code <b className="font-mono">{code}</b>{q.offers.code === 'applied' ? ' applied.' : <span className="text-store-bad"> — this code doesn’t work here.</span>}
          {' '}<button type="button" className="min-h-11 underline" onClick={() => { offerCode.set(''); setDraftCode('') }}>Remove</button></p>
      ) : typing ? (
        <div className="mt-2 flex gap-2">
          <label htmlFor="offer-code" className="sr-only">Offer code</label>
          <input id="offer-code" value={draftCode} maxLength={20} autoCapitalize="characters" placeholder="Code" onChange={(e) => setDraftCode(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase())}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (draftCode) offerCode.set(draftCode) } }} className={`${field} font-mono`} />
          <button type="button" disabled={!draftCode} onClick={() => offerCode.set(draftCode)} className="h-11 shrink-0 rounded-sm border border-store-ink px-4 text-sm font-medium disabled:opacity-50">Apply</button>
        </div>
      ) : <button type="button" className="mt-1 min-h-11 text-sm underline" onClick={() => setTyping(true)}>Have a code?</button>)}

      {waOptIn ? (
        <label className="mt-4 flex min-h-11 cursor-pointer items-start gap-3 text-sm">
          <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-store-ink" />
          <span>{waOptInText(shopName)}</span>
        </label>
      ) : null}

      <h2 className={sect}>Payment</h2>
      <div role="radiogroup" aria-label="How to pay" className="space-y-2">
        {q && online && (
          <label className={`store-pay block cursor-pointer rounded-[var(--store-radius)] border bg-store-paper p-3 ${method === 'prepaid' ? 'border-store-ink shadow-[0_0_0_1px_var(--store-ink)]' : 'border-store-line'}`}>
            <span className="flex items-center gap-2"><input type="radio" name="pay" checked={method === 'prepaid'} onChange={() => choose('prepaid')} className="accent-store-ink" /><b className="font-medium">Pay online</b><span className="ml-auto tabular-nums">{inr(q.prepaid)}</span></span>
            <span className="ml-6 block text-sm text-store-sub">UPI, cards, netbanking. Opens Razorpay.{saving ? <b className="ml-1 font-medium text-store-good">Saves {inr(saving.amount)}</b> : null}</span>
          </label>
        )}
        {q && (codOk ? (
          <label className={`store-pay block cursor-pointer rounded-[var(--store-radius)] border bg-store-paper p-3 ${method === 'cod' ? 'border-store-ink shadow-[0_0_0_1px_var(--store-ink)]' : 'border-store-line'}`}>
            <span className="flex items-center gap-2"><input type="radio" name="pay" checked={method === 'cod'} onChange={() => choose('cod')} className="accent-store-ink" /><b className="font-medium">Pay on delivery</b><span className="ml-auto tabular-nums">{inr(q.cod!.total)}</span></span>
            <span className="ml-6 block text-sm text-store-sub">{q.cod!.charge ? `Includes a ${inr(q.cod!.charge)} Pay on delivery fee. ` : ''}Cash or UPI to the courier.{saving ? ` No ${inr(saving.amount)} online saving.` : ''}</span>
          </label>
        ) : (
          <div className="rounded-sm border border-store-line p-3 opacity-70"><b className="font-medium">Pay on delivery</b><p className="text-sm text-store-bad">{codWhyNotText(q.codWhyNot)}</p></div>
        ))}
      </div>

      <h2 className={sect}>Your order</h2>
      <ul className="divide-y divide-store-line text-sm">
        {lines.map((l) => (
          <li key={l.variantId} className="flex items-center gap-3 py-2">
            {l.image ? <img src={urlFor(l.image.base, pick(l.image.widths, 160))} alt="" width={40} height={50} data-photo className="h-[50px] w-10 rounded-sm object-cover" /> : <span className="h-[50px] w-10 rounded-sm bg-store-chip" />}
            <span className="min-w-0 flex-1">{l.title}<span className="block text-store-sub">{l.values.join(' · ')} × {l.qty}</span></span>
            <span className="tabular-nums">{inr(l.unitPrice * l.qty)}</span>
          </li>
        ))}
      </ul>
      {q && (
        <div className="mt-2 space-y-1 text-sm">
          <OfferRows applied={method === 'cod' ? q.cod?.applied ?? [] : q.appliedPrepaid.filter((a) => a.class !== 'payment' || method === 'prepaid')} />
          <p className="flex justify-between"><span>Delivery</span><span>{q.shipping ? inr(q.shipping) : 'Free'}</span></p>
          {method === 'cod' && q.cod?.charge ? <p className="flex justify-between"><span>Pay on delivery fee</span><span>{inr(q.cod.charge)}</span></p> : null}
          {q.arrives && <p className="flex justify-between text-store-sub"><span>Arrives</span><span>{dayRange(q.arrives)}</span></p>}
          {returnLine && <p className="flex justify-between text-store-sub"><span>Returns</span><span>{returnLine}</span></p>}
        </div>
      )}
      <p className="mt-4 border-t border-store-line pt-3 text-xs text-store-sub">
        {legalName || shopName} uses your name, phone and address only to deliver this order and to contact you about it. <a href={privacyHref} className="underline">Your data and how to ask for it to be deleted</a>.
      </p>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-store-line bg-store-paper px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] pt-3 shadow-store-bar">
        <div className="mx-auto max-w-lg">
          <p className="flex justify-between text-sm"><span className="text-store-sub">{method === 'cod' ? 'Pay on delivery' : method === 'prepaid' ? 'Pay online' : 'Choose how to pay'}</span><b className="tabular-nums">{q ? inr(failed && method !== 'cod' ? failed.total : total) : '…'}</b></p>
          <button type="submit" disabled={busy || !q || q.empty || (!method && !failed)} className="store-btn store-buy mt-2 h-12 w-full rounded-[var(--store-radius)] bg-store-button text-base font-medium text-store-on-button disabled:opacity-60">{busy ? 'Placing your order…' : button}</button>
        </div>
      </div>
    </form>
  )
}
