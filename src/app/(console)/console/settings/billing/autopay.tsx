'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
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
  const toast = useToast()
  const run = (begin: () => ReturnType<typeof startAutopay>, finish: (a: { order: string; payment: string; signature: string }) => Promise<{ ok: boolean; error?: string }>, done: string, extra: object = {}) => start(async () => {
    const s = await begin()
    if (!s.ok) { toast.error(s.error); return }
    if (!(await loadRazorpay()) || !window.Razorpay) { toast.error('The payment page could not load. Check your connection.'); return }
    await new Promise<void>((resolve) => {
      const rz = new window.Razorpay!({
        key: s.key, order_id: s.order, ...(s.customer ? { customer_id: s.customer, recurring: '1' } : {}), name: 'Frrata', ...extra,
        handler: async (a: Answer) => {
          const r = await finish({ order: a.razorpay_order_id, payment: a.razorpay_payment_id, signature: a.razorpay_signature })
          if (r.ok) { toast.ok(done); router.refresh() } else toast.error(r.error ?? 'Something went wrong.')
          resolve()
        },
        modal: { ondismiss: () => { toast.error('Closed before finishing.', { sub: 'Nothing was set up or paid.' }); resolve() } },
      })
      rz.open()
    })
  })
  return { busy, run }
}

export function SetUpAutopay() {
  const { busy, run } = useCheckout()
  const go = (method: 'upi' | 'card' | 'emandate') => run(() => startAutopay(method), completeAutopay, 'Autopay is on. Frrata tells you each amount a day before it is taken.', { description: 'Autopay for Frrata bills' })
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => go('upi')} aria-disabled={busy}>UPI Autopay</Button>
        <Button variant="secondary" onClick={() => go('card')} aria-disabled={busy}>Card</Button>
        <Button variant="secondary" onClick={() => go('emandate')} aria-disabled={busy}>Bank mandate (eNACH)</Button>
      </div>
      <p className="text-xs text-muted-foreground">UPI, card: up to ₹15,000 · eNACH: above</p>
    </div>
  )
}

export function StopAutopay() {
  const router = useRouter()
  const [busy, start] = useTransition()
  const toast = useToast()
  return (
    <span>
      <Button variant="ghost" aria-disabled={busy} onClick={() => start(async () => { const r = await stopAutopay(); if (r.ok) router.refresh(); else toast.error(r.error) })}>Turn off autopay</Button>
    </span>
  )
}

export function PayNow({ invoiceId }: { invoiceId: string }) {
  const { busy, run } = useCheckout()
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button variant="secondary" aria-disabled={busy} onClick={() => run(() => startPayNow(invoiceId), completePayNow, 'Paid. Thank you.', { description: 'Frrata invoice' })}>Pay now</Button>
    </span>
  )
}
