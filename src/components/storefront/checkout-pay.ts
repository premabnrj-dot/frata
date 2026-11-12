import { api, type OrderRef, type Pay } from './shop-client'

// =============================================================================
// FILE: src/components/storefront/checkout-pay.ts — opening Razorpay at checkout, fetched only when a shopper pays
// online (checkout's first-load budget is 121 kB). Calls back with done, or with the message to show.
// =============================================================================

declare global { interface Window { Razorpay?: new (o: object) => { open: () => void; on: (e: string, f: (r: unknown) => void) => void } } }

function loadRazorpay(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true)
  return new Promise((res) => {
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = () => res(true); s.onerror = () => res(false)
    document.head.appendChild(s)
  })
}

export async function openRazorpay(ref: OrderRef, pay: Pay, on: { done: () => void; failed: (text: string) => void }) {
  if (!(await loadRazorpay()) || !window.Razorpay) { on.failed('Online payment could not open. Check your connection, or pay on delivery instead.'); return }
  const rzp = new window.Razorpay({
    key: pay.keyId, amount: pay.amount, currency: 'INR', order_id: pay.razorpayOrderId, name: pay.shop,
    prefill: { name: pay.name, contact: `+91${pay.phone}` },
    handler: async (resp: { razorpay_payment_id: string; razorpay_signature: string }) => {
      await api('/api/shop/orders/pay', { ...ref, paymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature })
      on.done()
    },
    // Closed without paying: the hold ends now, so the size is on sale again (a retry renews it). Awaited before the
    // shopper can tap Try again, so the release never lands after the retry's renewed hold. Razorpay is asked first:
    // a payment that went through after all is the order's.
    modal: { ondismiss: async () => {
      const r = await api<{ paid?: boolean }>('/api/shop/orders/pay', { ...ref, dismissed: true })
      if (r.ok && r.data.paid) { on.done(); return }
      on.failed('Payment did not go through. Nothing was charged. Try again, or pay on delivery instead: your details are kept.')
    } },
  })
  rzp.on('payment.failed', () => { void api('/api/shop/orders/pay', { ...ref, failed: true }) })
  rzp.open()
}

/** Paying for a change to a paid order (OE·2): the same sheet on the shop's key, its reply to /change. Closing it changes nothing. */
export async function openChangePayment(ref: OrderRef, pay: Pay, on: { done: () => void; failed: (text: string) => void }) {
  if (!(await loadRazorpay()) || !window.Razorpay) { on.failed('Online payment could not open. Check your connection and try again.'); return }
  const rzp = new window.Razorpay({
    key: pay.keyId, amount: pay.amount, currency: 'INR', order_id: pay.razorpayOrderId, name: pay.shop,
    prefill: { name: pay.name, contact: `+91${pay.phone}` },
    handler: async (resp: { razorpay_payment_id: string; razorpay_signature: string }) => {
      const r = await api('/api/shop/orders/change', { ...ref, paymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature })
      if (r.ok) on.done(); else on.failed(r.data.error ?? 'We could not confirm this payment. If money left your account, the shop will see it within minutes.')
    },
    modal: { ondismiss: () => on.failed('Payment did not go through. Nothing was charged. Try again.') },
  })
  rzp.open()
}
