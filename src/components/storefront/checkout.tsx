'use client'

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { STATES } from '@/domains/checkout/state-names'
import { announcePlaced, moduleArm, usePrefill } from './module-events'
import { waOptInText } from '@/domains/checkout/opt-in'
import type { Biz, BizCheck } from './checkout-biz'
import { pick, urlFor } from '@/domains/media/sizes'
import { OfferRows, useQuote } from './bag-quote'
import { ATTR_KEY, bag, offerCode, useBag, useOfferCode } from './bag-store'
import { fitKey, shownQuote } from '@/domains/checkout/fitted'
import { api, dayRange, inr, type Pay, type PublicQuote } from './shop-client'
import { PayBar, useQuoteToast } from './checkout-feedback'
import { useStoreToast } from './store-toast'
import { chunk } from './chunk'
import { NoteMark } from './note-mark'
import type { Gone } from './checkout-stepper'

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
// Its own chunk too: the field summary is needed only after a submit with mistakes (loaded once the page settles).
// A chunk that cannot load (no connection) draws nothing, never the page's error: the lines under the fields still say it.
const summary = () => import('./checkout-summary').catch(() => ({ default: () => null }))
const CheckoutSummary = lazy(summary)
// And the offers and the code line (checkout-offers.tsx): they show once the bag is priced, and the chunk is asked for on
// mount, so it is in by then. One that cannot load leaves them out and is asked for again with the next price; the
// totals still carry every offer the server applied.
type Offers = typeof import('./checkout-offers').default
const loadOffers = chunk(() => import('./checkout-offers').then((m) => m.default))
// A code-site store's editable lines (one-address P2·4): their own chunk too; until it is in, the plain lines show.
type Stepper = typeof import('./checkout-stepper').default
const loadStepper = chunk(() => import('./checkout-stepper').then((m) => m.default))

export function Checkout({ shopName, legalName, privacyHref, returnLine, gst = { deliversWithin: null, b2b: false }, waOptIn = false, identity, brand }: { shopName: string; legalName: string; privacyHref: string; returnLine: string | null
  /** GST (plan 2026-11-09-gst-core-and-categories): a shop without a regular GSTIN delivers within its state; business buyers may ask for a GST invoice. */
  gst?: { deliversWithin: string | null; b2b: boolean }
  /** Show the WhatsApp opt-in (the shop has WhatsApp connected): unticked, naming the shop. */
  waOptIn?: boolean
  /** What a module puts above the form (slot checkout.identity: EkCode's button or its signed-in strip). */
  identity?: React.ReactNode
  /** A code-site store's checkout design (one-address P2·3): its heading ('' draws "Checkout") and its trust blocks,
   *  drawn on the server (trust-blocks.tsx); "Secure payment" hides itself while online payment isn't offered here. */
  brand?: { heading: string; trust: React.ReactNode } }) {
  const [biz, setBiz] = useState<Biz>({ on: false, gstin: '', name: '' })
  const bizCheck = useRef<BizCheck | null>(null)
  const registerBiz = useCallback((c: BizCheck) => { bizCheck.current = c }, [])
  const [f, setF] = useState<Form>(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  // Each submit with mistakes (the browser's check or the server's) shows the summary again; `sub` is a refusal's words.
  const [tries, setTries] = useState<{ n: number; sub?: string }>({ n: 0 })
  const formRef = useRef<HTMLFormElement>(null)
  const toast = useStoreToast()
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
  useQuoteToast(toast, q ? quoteError : null, refresh)
  useEffect(() => { const t = setTimeout(() => void summary().catch(() => {}), 3000); return () => clearTimeout(t) }, [])
  const [Offers, setOffers] = useState<{ C: Offers } | null>(null)
  useEffect(() => {
    if (Offers) return
    let live = true
    void loadOffers().then((C) => { if (live) setOffers({ C }) }, () => {})
    return () => { live = false }
  }, [Offers, q])
  const [Stepper, setStepper] = useState<{ C: Stepper } | null>(null)
  const [gone, setGone] = useState<Gone[]>([])
  useEffect(() => {
    if (!brand || Stepper) return
    let live = true
    void loadStepper().then((C) => { if (live) setStepper({ C }) }, () => {})
    return () => { live = false }
  }, [brand, Stepper, q])

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

  // Focus the first wrong field here too: the summary's chunk may be slow or not load (impact review F3).
  const focusWrong = () => requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
  async function check(): Promise<boolean> {
    const { formErrors } = await import('./checkout-place')
    const e = formErrors(f, gst.deliversWithin, biz.on ? bizCheck.current?.(biz, f.state) ?? null : null)
    setErrors(e)
    // The summary moves focus to the first wrong field and says how many.
    if (Object.keys(e).length) { setTries((t) => ({ n: t.n + 1 })); focusWrong(); return false }
    return true
  }

  async function place() {
    if (!q || !method || busy) return
    if (!(await check())) return
    const { cleanGstin } = await import('./checkout-place')
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
      // Field mistakes the server found go to their fields (`address.phone` → `phone`), its refusal as the summary's
      // second line; any other refusal is the line above the form.
      // Only mistakes with a field on screen (a bag line or a hidden key has none: impact review F3).
      const drawn = Object.entries(r.data.fields ?? {}).map(([k, v]) => [k.replace(/^address\./, ''), v] as const).filter(([k]) => formRef.current?.querySelector(`#${CSS.escape(k)}`))
      if (drawn.length) {
        setErrors(Object.fromEntries(drawn))
        setTries((t) => ({ n: t.n + 1, sub: r.data.error }))
        focusWrong()
        return
      }
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
  // feedback-ok: shop field line (§ Feedback 3), shop colours
  const Err = ({ k }: { k: string }) => (errors[k] ? <p id={`${k}-err`} className="ck-fe mt-1 text-sm text-store-bad"><NoteMark />{errors[k]}</p> : null)
  const label = 'ck-label mb-1 block text-sm font-medium'
  const sect = 'ck-sect mb-2 mt-6 text-xs font-semibold uppercase tracking-[0.1em] text-store-sub'
  const button = useMemo(() => {
    if (!q || q.empty) return 'Nothing to pay for'
    if (failed) return method === 'cod' ? `Pay on delivery · ${inr(codTotal ?? q.cod?.total ?? 0)}` : `Try paying again · ${inr(failed.total)}`
    if (!method) return 'Choose how to pay'
    return method === 'cod' ? `Place order · ${inr(total)}` : `Pay · ${inr(total)}`
  }, [q, method, total, failed])

  if (q && q.empty && !lines.length && !gone.length) return <p className="py-10 text-center">Your bag is empty. <a href="/products" className="underline">See what is new</a></p>

  return (
    <form ref={formRef} noValidate onSubmit={(e) => { e.preventDefault(); if (failed) return method === 'cod' ? void switchToCod() : void retry(); void place() }} className="ck-form mx-auto max-w-lg px-4 pb-40 pt-4 sm:px-0">
      <h1 className="ck-h1 text-2xl" style={{ fontFamily: 'var(--store-display)' }}>{brand?.heading || 'Checkout'}</h1>
      {tries.n > 0 && <Suspense fallback={null}><CheckoutSummary toast={toast} errors={errors} attempt={tries.n} sub={tries.sub} scope={formRef} /></Suspense>}
      {/* feedback-ok: rule 5 — a failed payment's line with its filled form, a refused placement (nothing charged), a changed price */}
      {msg && <p role="alert" className={`ck-msg mt-4 border-l-2 px-3 py-2 text-sm ${msg.tone === 'changed' ? 'border-store-accent bg-store-chip' : 'border-store-bad bg-store-chip'}`}><NoteMark info={msg.tone === 'changed'} bad={msg.tone !== 'changed'} /><span>{msg.text}</span></p>}
      {/* feedback-ok: no price at all is the page's state (Pay waits on it), so it stays; with an older price it is a toast */}
      {quoteError && !q && <p role="alert" className="mt-4 text-sm text-store-bad">{quoteError}</p>}
      {identity && <div className="mt-4 grid gap-3">{identity}</div>}

      <fieldset disabled={!!failed} className="disabled:opacity-60">
        <h2 className={sect}>Contact</h2>
        <label htmlFor="phone" className={label}>Mobile number</label>
        <div className="flex"><span className="store-field grid h-11 place-items-center rounded-l-[var(--store-radius)] border border-r-0 border-store-sub/45 bg-store-chip px-3 text-store-sub">+91</span>
          <input id="phone" inputMode="tel" autoComplete="tel-national" value={f.phone} onChange={(e) => set('phone', e.target.value)} aria-invalid={!!errors.phone || undefined} aria-describedby="phone-help phone-err" className={`${field} rounded-l-none`} /></div>
        <p id="phone-help" className="ck-help mt-1 text-xs text-store-sub">The courier calls this number to deliver.</p><Err k="phone" />
        <label htmlFor="email" className={`${label} mt-3`}>Email <span className="font-normal text-store-sub">(optional)</span></label>
        <input id="email" type="email" inputMode="email" autoComplete="email" maxLength={254} value={f.email} onChange={(e) => set('email', e.target.value)} aria-invalid={!!errors.email || undefined} aria-describedby="email-help email-err" className={field} />
        <p id="email-help" className="ck-help mt-1 text-xs text-store-sub">For your order updates and invoice.</p><Err k="email" />

        <h2 className={sect}>Delivery address</h2>
        <div className="space-y-3">
          <div><label htmlFor="name" className={label}>Full name</label><input id="name" autoComplete="name" value={f.name} onChange={(e) => set('name', e.target.value)} aria-invalid={!!errors.name || undefined} aria-describedby="name-err" className={field} /><Err k="name" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label htmlFor="pincode" className={label}>PIN code</label><input id="pincode" inputMode="numeric" autoComplete="postal-code" maxLength={6} value={f.pincode} onChange={(e) => set('pincode', e.target.value.replace(/\D/g, ''))} aria-invalid={!!errors.pincode || undefined} aria-describedby="pincode-err" className={field} /><Err k="pincode" /></div>
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
        {/* feedback-ok: the state field's own rule (a shop without a regular GSTIN), said beside it */}
        {gst.deliversWithin && f.state && f.state !== gst.deliversWithin && !errors.state ? <p className="text-sm text-store-bad">This shop delivers within {gst.deliversWithin} only.</p> : null}
      </fieldset>

      {gst.b2b ? (
        <Suspense fallback={null}>
          <CheckoutBiz biz={biz} setBiz={setBiz} errors={errors} register={registerBiz} field={field} label={label} err={(k) => <Err k={k} />}
            clear={(k) => setErrors((x) => { const n = { ...x }; delete n[k]; return n })} />
        </Suspense>
      ) : null}

      {Offers ? <Offers.C q={q} code={code} typing={typing} setTyping={setTyping} draftCode={draftCode} setDraftCode={setDraftCode} field={field} sect={sect} /> : null}

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
          // feedback-ok: rule 5 — why Pay on delivery is not offered, on its own card
          <div className="rounded-sm border border-store-line p-3 opacity-70"><b className="font-medium">Pay on delivery</b><p className="text-sm text-store-bad">{q.codWhy}</p></div>
        ))}
      </div>

      <h2 className={sect}>Your order</h2>
      {brand && Stepper ? <Stepper.C lines={q?.lines ?? []} gone={gone} setGone={setGone} /> : <ul className="divide-y divide-store-line text-sm">
        {lines.map((l) => (
          <li key={l.variantId} className="flex items-center gap-3 py-2">
            {l.image ? <img src={urlFor(l.image.base, pick(l.image.widths, 160))} alt="" width={40} height={50} data-photo className="h-[50px] w-10 rounded-sm object-cover" /> : <span className="h-[50px] w-10 rounded-sm bg-store-chip" />}
            <span className="min-w-0 flex-1">{l.title}<span className="block text-store-sub">{l.values.join(' · ')} × {l.qty}</span></span>
            <span className="tabular-nums">{inr(l.unitPrice * l.qty)}</span>
          </li>
        ))}
      </ul>}
      {q && (
        <div className="mt-2 space-y-1 text-sm">
          <OfferRows applied={method === 'cod' ? q.cod?.applied ?? [] : q.appliedPrepaid.filter((a) => a.class !== 'payment' || method === 'prepaid')} />
          <p className="flex justify-between"><span>Delivery</span><span>{q.shipping ? inr(q.shipping) : 'Free'}</span></p>
          {method === 'cod' && q.cod?.charge ? <p className="flex justify-between"><span>Pay on delivery fee</span><span>{inr(q.cod.charge)}</span></p> : null}
          {q.arrives && q.deliverable && <p className="flex justify-between text-store-sub"><span>Arrives</span><span>{dayRange(q.arrives)}</span></p>}
          {/* feedback-ok: the address's answer beside the total it stops (a state of this PIN code, not a failure after a button) */}
          {!q.deliverable && <p role="alert" className="ck-fe text-sm text-store-bad"><NoteMark />This shop does not deliver to this PIN code yet.</p>}
          {returnLine && <p className="flex justify-between text-store-sub"><span>Returns</span><span>{returnLine}</span></p>}
        </div>
      )}
      {brand?.trust ? <div data-online={online ? '1' : '0'}>{brand.trust}</div> : null}
      <p className="mt-4 border-t border-store-line pt-3 text-xs text-store-sub">
        {legalName || shopName} uses your name, phone and address only to deliver this order and to contact you about it. <a href={privacyHref} className="underline">Your data and how to ask for it to be deleted</a>.
      </p>

      <PayBar>
        <div className="mx-auto max-w-lg">
          <p className="flex justify-between text-sm"><span className="text-store-sub">{method === 'cod' ? 'Pay on delivery' : method === 'prepaid' ? 'Pay online' : 'Choose how to pay'}</span><b className="tabular-nums">{q ? inr(failed && method !== 'cod' ? failed.total : total) : '…'}</b></p>
          <button type="submit" disabled={busy || !q || q.empty || !q.deliverable || (!method && !failed)} className="store-btn store-buy mt-2 h-12 w-full rounded-[var(--store-radius)] bg-store-button text-base font-medium text-store-on-button disabled:opacity-60">{busy ? 'Placing your order…' : button}</button>
        </div>
      </PayBar>
    </form>
  )
}
