import { api, type Pay } from './shop-client'

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

export async function openRazorpay(token: string, pay: Pay, on: { done: () => void; failed: (text: string) => void }) {
  if (!(await loadRazorpay()) || !window.Razorpay) { on.failed('Online payment could not open. Check your connection, or pay on delivery instead.'); return }
  const rzp = new window.Razorpay({
    key: pay.keyId, amount: pay.amount, currency: 'INR', order_id: pay.razorpayOrderId, name: pay.shop,
    prefill: { name: pay.name, contact: `+91${pay.phone}` },
    handler: async (resp: { razorpay_payment_id: string; razorpay_signature: string }) => {
      await api('/api/shop/orders/pay', { token, paymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature })
      on.done()
    },
    modal: { ondismiss: () => on.failed('Payment did not go through. Nothing was charged. Try again, or pay on delivery instead: your details are kept.') },
  })
  rzp.on('payment.failed', () => { void api('/api/shop/orders/pay', { token, failed: true }) })
  rzp.open()
}
