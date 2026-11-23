'use client'

import { useState, useSyncExternalStore, useTransition } from 'react'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { Icon, type IconName } from '@/components/icons/icon'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { completeAutopay, completePayNow, startAutopay, startPayNow, stopAutopay } from './actions'
import { loadRazorpay, type Answer } from '@/components/billing/razorpay'

// Autopay and Pay now (billing B3): Razorpay Checkout opens with an order the SERVER made; its answer goes back to the
// server, which verifies the signature and reads the payment from the gateway itself before anything is saved.

// Razorpay Checkout is one modal for the whole tab: Overview's dialog, the Payment tab's inline picker and Pay now
// can each start one, so a second trigger must wait for the first to finish or two stack, each unaware of the other
// (gotcha 2026-11-22: "Turn on autopay" reopened in front of an already-open Checkout that was mid-flow).
let checkoutOpen = false
const listeners = new Set<() => void>()
function setCheckoutOpen(v: boolean) { checkoutOpen = v; for (const l of listeners) l() }
function subscribeCheckoutOpen(l: () => void) { listeners.add(l); return () => listeners.delete(l) }
function useCheckoutOpen() { return useSyncExternalStore(subscribeCheckoutOpen, () => checkoutOpen, () => false) }

function useCheckout() {
  const router = useRouter()
  const [busy, start] = useTransition()
  const toast = useToast()
  const run = (begin: () => ReturnType<typeof startAutopay>, finish: (a: { order: string; payment: string; signature: string }) => Promise<{ ok: boolean; error?: string }>, done: string, extra: object = {}) => start(async () => {
    setCheckoutOpen(true)
    try {
      const s = await begin()
      if (!s.ok) { toast.error(s.error); return }
      if (!(await loadRazorpay()) || !window.Razorpay) { toast.error('The payment page could not load. Check your connection.'); return }
      await new Promise<void>((resolve) => {
        const rz = new window.Razorpay!({
          key: s.key, order_id: s.order, ...(s.customer ? { customer_id: s.customer, recurring: '1' } : {}), name: 'Frrata', ...extra,
          handler: async (a: Answer) => {
            const r = await finish({ order: a.razorpay_order_id, payment: a.razorpay_payment_id, signature: a.razorpay_signature })
            if (r.ok) { toast.ok(done); router.refresh() } else toast.error(r.error ?? 'We couldn’t set up autopay. Nothing was changed.')
            resolve()
          },
          modal: { ondismiss: () => { toast.error('Closed before finishing.', { sub: 'Nothing was set up or paid.' }); resolve() } },
        })
        rz.open()
      })
    } finally { setCheckoutOpen(false) }
  })
  return { busy, run }
}

const METHODS: { key: 'upi' | 'card' | 'emandate'; icon: IconName; name: string; limit: string; best: boolean }[] = [
  { key: 'upi', icon: 'upi', name: 'UPI Autopay', limit: 'Up to ₹15,000 a debit · approve in your UPI app', best: true },
  { key: 'card', icon: 'payments', name: 'Card', limit: 'Up to ₹15,000 a debit', best: false },
  { key: 'emandate', icon: 'bank', name: 'Bank account (eNACH)', limit: 'Above ₹15,000 · ready in 1–2 days', best: false },
]

/** The three ways to pay automatically, UPI first (rework R1 mockup § Payment): each opens Razorpay Checkout. While
 *  one is processing, the other two fade and refuse a click — one Checkout at a time (useCheckoutOpen). */
export function SetUpAutopay({ onStarted }: { onStarted?: () => void }) {
  const { busy, run } = useCheckout()
  const anyOpen = useCheckoutOpen()
  const [selected, setSelected] = useState<(typeof METHODS)[number]['key'] | null>(null)
  const go = (method: (typeof METHODS)[number]['key']) => {
    setSelected(method); onStarted?.()
    run(() => startAutopay(method), completeAutopay, 'Autopay is on. We tell you each amount a day before.', { description: 'Autopay for Frrata bills' })
  }
  return (
    <div role="group" aria-label="Pay with" className="flex flex-col gap-2">
      {METHODS.map((m) => (
        <Button key={m.key} variant="secondary" size="wrap" busy={busy && selected === m.key} disabled={anyOpen && selected !== m.key}
          onClick={() => go(m.key)} className="min-h-15 justify-between gap-3">
          <span className="flex items-center gap-3">
            <span aria-hidden="true" data-tinge className="inline-grid size-10 shrink-0 place-items-center rounded-xl bg-muted"><Icon name={m.icon} className="size-5" /></span>
            <span className="flex flex-col text-left"><span className="font-semibold">{m.name}</span><span className="text-label font-normal text-muted-foreground">{m.limit}</span></span>
          </span>
          {m.best ? <Badge tone="ok">Recommended</Badge> : null}
        </Button>
      ))}
    </div>
  )
}

/** Overview's "Turn on autopay": the same three ways, in a dialog. Stays off while a Checkout from elsewhere on the
 *  page (the Payment tab's inline picker, Pay now) is still open, so it never reopens on top of one. */
export function SetUpAutopayDialog({ label = 'Turn on autopay', variant = 'primary' }: { label?: string; variant?: 'primary' | 'secondary' }) {
  const [open, setOpen] = useState(false)
  const anyOpen = useCheckoutOpen()
  return (
    <>
      <Button variant={variant} disabled={anyOpen} onClick={() => setOpen(true)}>{label}</Button>
      <Dialog open={open && !anyOpen} onClose={() => setOpen(false)} title={label === 'Turn on autopay' ? 'Turn on autopay' : 'Change how autopay pays'} actions={<Button variant="secondary" data-autofocus onClick={() => setOpen(false)}>Not now</Button>}>
        <SetUpAutopay onStarted={() => setOpen(false)} />
      </Dialog>
    </>
  )
}

export function StopAutopay() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, start] = useTransition()
  const [refused, setRefused] = useState<string | null>(null)
  const toast = useToast()
  const stop = () => start(async () => { const r = await stopAutopay(); if (r.ok) { setOpen(false); toast.ok('Autopay is off.'); router.refresh() } else setRefused(r.error) })
  return (
    <>
      <Button variant="danger" onClick={() => { setRefused(null); setOpen(true) }}>Turn off autopay</Button>
      <Dialog open={open} onClose={() => setOpen(false)} error={refused} title="Turn off autopay?" description="Pay each bill yourself by its due date."
        actions={<><Button variant="secondary" data-autofocus onClick={() => setOpen(false)}>Keep autopay</Button><Button variant="destructive" busy={busy} onClick={stop}>Turn off autopay</Button></>} />
    </>
  )
}

export function PayNow({ invoiceId }: { invoiceId: string }) {
  const { busy, run } = useCheckout()
  const anyOpen = useCheckoutOpen()
  return (
    <Button variant="secondary" busy={busy} disabled={!busy && anyOpen} onClick={() => run(() => startPayNow(invoiceId), completePayNow, 'Paid. Thank you.', { description: 'Frrata invoice' })}>Pay this bill</Button>
  )
}
