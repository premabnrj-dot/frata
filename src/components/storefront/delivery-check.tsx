'use client'

import { useEffect, useRef, useState } from 'react'
import { api, inr } from './shop-client'
import { fill } from './fill'
import type { BuyWords } from './words'
import { chargeOn, codOn, type DeliveryTerms } from '@/domains/delivery/floor'

// Delivery Zones PD·0 (plan docs/plans/2026-11-12-delivery-zones.md; approved mockup "PIN code check"): under the buy
// box, every plan. Asks /api/shop/delivery for this PIN code's public terms and applies them to the piece's price here
// (pay on delivery's limits, free delivery above). The PIN code is remembered in this browser only (localStorage, the
// shop's own address; never a cookie, never in pixels or attribution: security review L4). No countdown.

type Terms = {
  place: { city: string; state: string } | null
  deliverable: boolean
  charge: number; freeAbove: number | null
  cod: { on: true; charge: number; min: number; max: number | null } | { on: false; why: 'off' | 'prepaid_only' }
  by: string | null
}
const KEY = 'frrata.pin'
const PIN = /^[1-9][0-9]{5}$/
const day = (iso: string) => new Date(`${iso}T00:00:00+05:30`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })

export function DeliveryCheck({ price, w }: { price: number | null; w: BuyWords }) {
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [t, setT] = useState<(Terms & { pin: string }) | null>(null)
  // Only the latest check's answer counts: the remembered PIN code's check on load can answer after a newer one.
  const latest = useRef(0)

  const check = async (p: string) => {
    if (!PIN.test(p)) { setError(w.pinBad); return }
    const mine = ++latest.current
    setBusy(true); setError(null)
    const r = await api<Terms>('/api/shop/delivery', { pincode: p })
    if (mine !== latest.current) return
    setBusy(false)
    if (!r.ok) { setError(r.status === 429 ? w.pinMany : w.pinFailed); return }
    setT({ ...r.data, pin: p })
    try { localStorage.setItem(KEY, p) } catch { /* private mode */ }
  }
  useEffect(() => {
    let saved: string | null = null
    try { saved = localStorage.getItem(KEY) } catch { /* private mode */ }
    // Never over what the shopper has already typed (the box can be filled before this runs).
    const box = document.getElementById('delivery-pin') as HTMLInputElement | null
    if (saved && PIN.test(saved) && !box?.value) { setPin(saved); void check(saved) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const place = t ? (t.place?.city ?? t.pin) : ''
  const lines: { text: string; tone: 'ok' | 'warn' | 'bad' | 'plain' }[] = []
  if (t && !t.deliverable) lines.push({ text: fill(w.pinNo, { place }), tone: 'bad' })
  if (t && t.deliverable) {
    if (t.by) lines.push({ text: fill(w.pinBy, { place, date: day(t.by) }), tone: 'ok' })
    // THE rule's own pay-on-delivery and charge (floor.ts: pure, no presets), for this piece as a bag of one: the
    // limit counts delivery and the fee, as checkout does (impact review DZ7).
    const terms: DeliveryTerms = { deliverable: true, zone: null, charge: t.charge, freeAbove: t.freeAbove, days: [0, 0],
      cod: t.cod.on ? { on: true, charge: t.cod.charge, min: t.cod.min, max: t.cod.max } : { on: false, why: t.cod.why } }
    const cod = price === null ? null : codOn(price, terms)
    if (cod?.offered) lines.push({ text: w.cod + (cod.charge > 0 ? fill(w.codExtra, { fee: inr(cod.charge) }) : ''), tone: 'plain' })
    else if (cod?.reason === 'above_max') lines.push({ text: fill(w.pinCodUpTo, { max: inr(cod.max) }), tone: 'warn' })
    else if (cod?.reason === 'prepaid_only' || (price === null && !t.cod.on && t.cod.why === 'prepaid_only')) lines.push({ text: w.pinOnline, tone: 'warn' })
    const charged = price === null ? t.charge : chargeOn(price, terms)
    lines.push({ text: !charged ? w.freeAll : fill(w.delivery, { flat: inr(t.charge) }) + (t.freeAbove ? fill(w.deliveryFreeAbove, { above: inr(t.freeAbove) }) : ''), tone: 'plain' })
  }
  const tone = { ok: 'text-store-good', warn: 'font-medium', bad: 'text-store-bad', plain: '' } as const

  return (
    <div className="mt-3 space-y-2" data-delivery-check>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void check(pin) }}>
        <label className="sr-only" htmlFor="delivery-pin">{w.pinLabel}</label>
        <input id="delivery-pin" inputMode="numeric" autoComplete="postal-code" maxLength={6} value={pin} placeholder={w.pinLabel}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className="h-11 min-w-0 flex-1 rounded-sm border border-store-line bg-transparent px-3 font-mono text-base" />
        <button type="submit" disabled={busy} className="h-11 shrink-0 rounded-sm border border-store-ink px-4 text-sm font-medium disabled:opacity-60">{busy ? w.pinChecking : w.pinCheck}</button>
      </form>
      {/* feedback-ok: PIN check's answer beside its field */}
      {error && <p role="alert" className="text-sm text-store-bad">{error}</p>}
      {lines.length > 0 && (
        <ul className="space-y-1 text-sm" aria-live="polite">
          {lines.map((l) => <li key={l.text} className={tone[l.tone]}>{l.tone === 'ok' ? '✓ ' : ''}{l.text}</li>)}
        </ul>
      )}
    </div>
  )
}
