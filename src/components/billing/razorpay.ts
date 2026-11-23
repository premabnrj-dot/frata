'use client'

// Razorpay Checkout in the browser (billing B3; Studio credits C1·4): the script loaded once, on the click that needs it
// (speed L2), never at page load. Checkout opens with an order the SERVER made; its answer only tells the server to look.
export type Rzp = new (o: object) => { open: () => void; on: (e: string, f: (r: unknown) => void) => void }
declare global { interface Window { Razorpay?: Rzp } }

export function loadRazorpay(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true)
  return new Promise((res) => {
    const s = document.createElement('script')
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'
    s.onload = () => res(true); s.onerror = () => res(false)
    document.head.appendChild(s)
  })
}
export type Answer = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }
