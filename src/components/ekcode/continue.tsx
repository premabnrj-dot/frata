'use client'

import { useEffect, useRef, useState } from 'react'
import { EK } from '@/domains/ekcode-core/brand'
import { DELIVERY_CHECKS_MS, GUEST_OFFER_AFTER_MS, RESEND_AFTER_MS } from '@/domains/ekcode-core/flow'
import { cleanMobile } from '@/domains/checkout/mobile'
import { timeIN } from '@/lib/format-date'

// =============================================================================
// FILE: src/components/ekcode/continue.tsx — THE SIGN-IN ON EKCODE.IN (approved mockup v4; frata-design-language §
// EkCode): one field per screen; the number checks itself; the code fills itself (one-time-code) and goes on the sixth
// digit; delivery is checked at 5, 12 and 20 s only; past 20 s without delivery, "Didn't get it?" offers Resend and the
// guest checkout (a failure is never named); proof of work runs in a Web Worker when asked. Every call is same-origin
// JSON; the flow lives in an HttpOnly cookie this code never sees.
// =============================================================================

type View = { hasAccount: boolean; name: string | null; phone: string; addresses: { id: string; label: string }[] }
type Pow = { nonce: string; bits: number; exp: number; sig: string }
type Step = 'phone' | 'code' | 'create' | 'confirm' | 'locked' | 'slow'

const post = async (path: string, body: unknown) => {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' })
  return { status: r.status, data: (await r.json().catch(() => ({}))) as Record<string, unknown> }
}

/** sha256(nonce|counter) with `bits` leading zero bits, found in a worker made from a blob (CSP worker-src blob:). */
function solve(c: Pow): Promise<number> {
  const src = `onmessage=async e=>{const{nonce,bits}=e.data;const enc=new TextEncoder();for(let i=0;;i++){const h=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(nonce+'|'+i)));let z=0;for(const b of h){if(b===0){z+=8;continue}z+=Math.clz32(b)-24;break}if(z>=bits){postMessage(i);return}}}`
  const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }))
  const w = new Worker(url)
  return new Promise((ok) => { w.onmessage = (e) => { ok(e.data as number); w.terminate(); URL.revokeObjectURL(url) }; w.postMessage(c) })
}

const field = 'h-12 w-full rounded-md border border-[var(--ek-sub)] bg-white px-3 text-base text-[var(--ek-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ek-ink)]'
const primary = 'relative h-12 w-full rounded-md bg-[var(--ek-ink)] text-[var(--ek-paper)] font-medium disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ek-ink)]'
const ghost = 'h-11 w-full rounded-md text-[var(--ek-ink)] font-medium hover:bg-[var(--ek-line)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ek-ink)]'

export function Continue({ shop, back, notice, age }: { shop: string; back: string; notice: string[]; age: string }) {
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [say, setSay] = useState<{ bad: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState<View | null>(null)
  const [address, setAddress] = useState<string | null>(null)
  const [sentAt, setSentAt] = useState(0)
  const [now, setNow] = useState(0)
  const [delivered, setDelivered] = useState(false)
  const [failed, setFailed] = useState(false)
  const codeRef = useRef<HTMLInputElement>(null)
  const valid = !!cleanMobile(phone)

  useEffect(() => { if (step !== 'code') return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [step]) // clock-ok: a timer in an effect, browser only
  useEffect(() => {
    if (step !== 'code' || !sentAt) return
    const timers = DELIVERY_CHECKS_MS.map((ms) => setTimeout(async () => {
      const r = await fetch('/api/ek/code', { cache: 'no-store' }).then((x) => x.json()).catch(() => null) as { delivered?: boolean; failed?: boolean } | null
      if (r?.delivered) setDelivered(true)
      if (r?.failed) setFailed(true)
    }, ms))
    codeRef.current?.focus()
    return () => timers.forEach(clearTimeout)
  }, [step, sentAt])

  async function send(pow: (Pow & { counter: number }) | null = null) {
    setBusy(true); setSay(null)
    const r = await post('/api/ek/code', { phone, pow })
    if (r.data.reason === 'pow') {
      setStep('slow')
      const c = r.data.challenge as Pow
      const counter = await solve(c)
      return send({ ...c, counter })
    }
    setBusy(false)
    if (r.data.ok) { setStep('code'); setCode(''); setSentAt(Date.now()); setNow(Date.now()); setDelivered(false); setFailed(false); return } // clock-ok: inside a click handler, after the send
    setStep('phone')
    if (r.status === 410) return setSay({ bad: true, text: EK.error })
    if (r.data.reason === 'invalid') return setSay({ bad: true, text: EK.phone.invalid })
    if (r.data.reason === 'wait' && typeof r.data.until === 'string') return setStep('locked'), setSay({ bad: true, text: EK.locked.tryAt(timeIN(new Date(r.data.until))) })
    setSay({ bad: true, text: EK.error })
  }

  async function check(v: string) {
    setBusy(true)
    const r = await post('/api/ek/verify', { code: v })
    setBusy(false)
    if (r.data.ok) {
      const vw = r.data.view as View
      setView(vw); setSay(null)
      setAddress(vw.addresses[0]?.id ?? null)
      return setStep(vw.hasAccount ? 'confirm' : 'create')
    }
    const left = Number(r.data.triesLeft ?? 0)
    setCode('')
    if (left <= 0) { setStep('locked'); return setSay({ bad: true, text: EK.locked.title }) }
    setSay({ bad: true, text: EK.code.wrong(left) })
  }

  async function createIt() {
    setBusy(true)
    const r = await post('/api/ek/create', { name })
    setBusy(false)
    if (r.data.ok) { setView(r.data.view as View); setAddress(null); return setStep('confirm') }
    setSay({ bad: true, text: EK.error })
  }

  async function go() {
    setBusy(true)
    const r = await post('/api/ek/continue', { addressId: address })
    if (r.data.ok && typeof r.data.url === 'string') return location.assign(r.data.url)
    setBusy(false); setSay({ bad: true, text: EK.error })
  }

  const since = sentAt ? now - sentAt : 0
  const resendIn = failed ? 0 : Math.max(0, Math.ceil((RESEND_AFTER_MS - since) / 1000))
  const notArrived = failed || (!delivered && since >= GUEST_OFFER_AFTER_MS)
  const chips = [EK.confirm.items.name, EK.confirm.items.phone, ...(address ? [EK.confirm.items.address] : [])]

  return (
    <section className="grid gap-4" aria-live="polite">
      <p className="text-sm text-[var(--ek-sub)]">{shop}</p>
      {step === 'phone' && (
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); if (valid && !busy) void send() }}>
          <h1 className="text-xl font-semibold">{EK.phone.title}</h1>
          <label className="sr-only" htmlFor="ek-phone">{EK.phone.title}</label>
          <div className="flex h-12 overflow-hidden rounded-md border border-[var(--ek-sub)] bg-white focus-within:outline focus-within:outline-2 focus-within:outline-[var(--ek-ink)]">
            <span className="grid place-items-center border-r border-[var(--ek-line)] px-3 font-mono text-[var(--ek-sub)]">+91</span>
            <input id="ek-phone" className="min-w-0 flex-1 px-3 font-mono text-base outline-none" inputMode="numeric" autoComplete="tel-national" maxLength={14}
              value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d ]/g, ''))} placeholder="98450 12345" autoFocus />
          </div>
          {say && <p className={`text-sm ${say.bad ? 'text-[var(--ek-cursor)]' : ''}`} role="alert">{say.text}</p>}
          <button className={primary} type="submit" disabled={!valid || busy}>{EK.phone.send}</button>
          <a className={`${ghost} grid place-items-center`} href={back}>{EK.phone.back(shop)}</a>
        </form>
      )}
      {step === 'slow' && (<div className="grid gap-2"><h1 className="text-xl font-semibold">{EK.slow.title}</h1><p className="text-sm text-[var(--ek-sub)]">{EK.slow.body}</p></div>)}
      {step === 'code' && (
        <div className="grid gap-4">
          <h1 className="text-xl font-semibold" id="ek-code-h">{EK.code.title}</h1>
          <div className="flex items-center justify-between gap-3 text-sm text-[var(--ek-sub)]">
            <span className="font-mono">{EK.code.sentTo(`+91 ${phone.replace(/\D/g, '').slice(-10, -5)} •••${phone.replace(/\D/g, '').slice(-2)}`)}</span>
            <button type="button" className="underline underline-offset-2 text-[var(--ek-ink)]" onClick={() => { setStep('phone'); setSay(null) }}>{EK.code.change}</button>
          </div>
          <input ref={codeRef} aria-labelledby="ek-code-h" className={`${field} font-mono tracking-[0.5em] text-center text-xl`} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
            value={code} disabled={busy} onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); setCode(v); if (v.length === 6) void check(v) }} />
          {say && <p className="text-sm text-[var(--ek-cursor)]" role="alert">{say.text}</p>}
          <a className={`${ghost} grid place-items-center border border-[var(--ek-sub)] sm:hidden`} href="whatsapp://">{EK.code.openWhatsApp}</a>
          {notArrived && <p className="text-sm font-medium">{EK.code.notArrived}</p>}
          <div className="flex items-center justify-between gap-3 text-sm">
            {resendIn > 0 ? <span className="font-mono text-[var(--ek-sub)]">{EK.code.resendIn(resendIn)}</span>
              : <button type="button" className="underline underline-offset-2" disabled={busy} onClick={() => void send()}>{EK.code.resend}</button>}
            {notArrived && <a className="underline underline-offset-2" href={back}>{EK.code.guest}</a>}
          </div>
        </div>
      )}
      {step === 'locked' && (
        <div className="grid gap-4">
          <h1 className="text-xl font-semibold">{EK.locked.title}</h1>
          {say && <p className="text-sm text-[var(--ek-cursor)]">{say.text}</p>}
          <a className={`${primary} grid place-items-center`} href={back}>{EK.code.guest}</a>
        </div>
      )}
      {step === 'create' && (
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); if (name.trim().length >= 2 && !busy) void createIt() }}>
          <h1 className="text-xl font-semibold">{EK.create.title}</h1>
          <label className="grid gap-1.5 text-sm font-medium" htmlFor="ek-name">{EK.create.name}
            <input id="ek-name" className={field} autoComplete="name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <ul className="grid gap-2 text-sm">{notice.map((l) => <li key={l} className="flex gap-2"><span aria-hidden="true">·</span>{l}</li>)}</ul>
          <p className="text-xs text-[var(--ek-sub)]">{age}</p>
          {say && <p className="text-sm text-[var(--ek-cursor)]" role="alert">{say.text}</p>}
          <button className={primary} type="submit" disabled={name.trim().length < 2 || busy}>{EK.create.action}</button>
          <a className={`${ghost} grid place-items-center`} href={back}>{EK.create.notNow}</a>
        </form>
      )}
      {step === 'confirm' && view && (
        <div className="grid gap-4">
          <h1 className="text-xl font-semibold">{EK.confirm.title(shop)}</h1>
          <div className="flex items-center gap-3 rounded-lg border border-[var(--ek-line)] bg-white p-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--ek-line)] text-sm font-semibold">{(view.name ?? '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()}</span>
            <span className="grid"><b className="font-semibold">{view.name}</b><span className="font-mono text-xs text-[var(--ek-sub)]">{view.phone}</span></span>
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-sm font-medium">{EK.confirm.deliverTo}</legend>
            {[...view.addresses, { id: '', label: EK.confirm.newAddress }].map((a) => (
              <label key={a.id || 'new'} className={`flex items-start gap-3 rounded-lg bg-white p-3 ${(address ?? '') === a.id ? 'border-2 border-[var(--ek-ink)]' : 'border border-[var(--ek-line)]'}`}>
                <input type="radio" name="ek-addr" className="mt-1 accent-[var(--ek-ink)]" checked={(address ?? '') === a.id} onChange={() => setAddress(a.id || null)} />
                <span className="grid"><b className="font-medium">{a.label}</b>{!a.id && <span className="text-sm text-[var(--ek-sub)]">{EK.confirm.newAddressHint(shop)}</span>}</span>
              </label>
            ))}
          </fieldset>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--ek-sub)]">{EK.confirm.gets(shop)} {chips.map((c) => <span key={c} className="rounded-full bg-[var(--ek-line)] px-2 py-0.5 text-[var(--ek-ink)]">{c}</span>)}</p>
          {say && <p className="text-sm text-[var(--ek-cursor)]" role="alert">{say.text}</p>}
          <button className={primary} type="button" disabled={busy} onClick={() => void go()}>{EK.confirm.action}</button>
          <a className={`${ghost} grid place-items-center`} href={back}>{EK.confirm.notYou}</a>
        </div>
      )}
    </section>
  )
}
