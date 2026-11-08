'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { completeAutopay, completePayNow, startAutopay, startPayNow, stopAutopay } from './actions'

// Autopay and Pay now (billing B3): Razorpay Checkout opens with an order the SERVER made; its answer goes back to the
// server, which verifies the signature and reads the payment from the gateway itself before anything is saved.

type Rzp = new (o: object) => { open: () => void; on: (e: string, f: (r: unknown) => void) => void }
declare global { interface Window { Razorpay?: Rzp } }
function loadRazorpay(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true)
  return new Promise((res) => {
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = () => res(true); s.onerror = () => res(false)
    document.head.appendChild(s)
  })
}
type Answer = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }

function useCheckout() {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const run = (begin: () => ReturnType<typeof startAutopay>, finish: (a: { order: string; payment: string; signature: string }) => Promise<{ ok: boolean; error?: string }>, done: string, extra: object = {}) => start(async () => {
    setMsg(null)
    const s = await begin()
    if (!s.ok) { setMsg({ ok: false, text: s.error }); return }
    if (!(await loadRazorpay()) || !window.Razorpay) { setMsg({ ok: false, text: 'The payment page could not load. Check your connection.' }); return }
    await new Promise<void>((resolve) => {
      const rz = new window.Razorpay!({
        key: s.key, order_id: s.order, ...(s.customer ? { customer_id: s.customer, recurring: '1' } : {}), name: 'Frrata', ...extra,
        handler: async (a: Answer) => {
          const r = await finish({ order: a.razorpay_order_id, payment: a.razorpay_payment_id, signature: a.razorpay_signature })
          setMsg(r.ok ? { ok: true, text: done } : { ok: false, text: r.error ?? 'Something went wrong.' })
          if (r.ok) router.refresh()
          resolve()
        },
        modal: { ondismiss: () => { setMsg({ ok: false, text: 'Closed before finishing. Nothing was set up or paid.' }); resolve() } },
      })
      rz.open()
    })
  })
  return { busy, msg, run }
}

export function SetUpAutopay() {
  const { busy, msg, run } = useCheckout()
  const go = (method: 'upi' | 'card' | 'emandate') => run(() => startAutopay(method), completeAutopay, 'Autopay is on. Frrata tells you each amount a day before it is taken.', { description: 'Autopay for Frrata bills' })
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => go('upi')} aria-disabled={busy}>UPI Autopay</Button>
        <Button variant="secondary" onClick={() => go('card')} aria-disabled={busy}>Card</Button>
        <Button variant="secondary" onClick={() => go('emandate')} aria-disabled={busy}>Bank mandate (eNACH)</Button>
      </div>
      <p className="text-xs text-muted-foreground">UPI and cards: up to ₹15,000 a month without approving each debit. Bills above that: a bank mandate (eNACH), approved once. Cards cost Frrata 2% + GST, so UPI or eNACH is better.</p>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? 'text-ok-text' : 'text-danger-text'}`}>{msg.text}</p>}
    </div>
  )
}

export function StopAutopay() {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  return (
    <span>
      <Button variant="ghost" aria-disabled={busy} onClick={() => start(async () => { const r = await stopAutopay(); if (r.ok) router.refresh(); else setErr(r.error) })}>Turn off autopay</Button>
      {err && <span role="alert" className="ml-2 text-sm text-danger-text">{err}</span>}
    </span>
  )
}

export function PayNow({ invoiceId }: { invoiceId: string }) {
  const { busy, msg, run } = useCheckout()
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button variant="secondary" aria-disabled={busy} onClick={() => run(() => startPayNow(invoiceId), completePayNow, 'Paid. Thank you.', { description: 'Frrata invoice' })}>Pay now</Button>
      {msg && <span role={msg.ok ? 'status' : 'alert'} className={`text-xs ${msg.ok ? 'text-ok-text' : 'text-danger-text'}`}>{msg.text}</span>}
    </span>
  )
}
