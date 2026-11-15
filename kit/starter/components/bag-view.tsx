'use client'

import { cartLink } from '@/lib/cart-link'
import { bag, useBag } from '@/lib/bag'

const rupees = (p: number) => `₹${(p / 100).toLocaleString('en-IN')}`

/** The bag, then Checkout: one link to the store's own checkout, which prices everything again. */
export function BagView({ checkoutOrigin }: { checkoutOrigin: string }) {
  const lines = useBag()
  if (!lines.length) return <p>Your bag is empty.</p>
  // The shopper's own utm_ tags from their first page, read at the tap (never during render).
  const checkout = () => {
    let utm: Record<string, string> = {}
    try { utm = Object.fromEntries([...new URLSearchParams(sessionStorage.getItem('landing') ?? '')].filter(([k]) => k.startsWith('utm_'))) } catch { /* private window */ }
    location.assign(cartLink(checkoutOrigin, lines, utm))
  }
  return (
    <>
      <ul className="lines">{lines.map((l) => (
        <li key={l.variantId}><span>{l.title} · {l.size}</span><span>{l.qty} × {rupees(l.price)}</span>
          <button type="button" onClick={() => bag.remove(l.variantId)} aria-label={`Remove ${l.title}`}>Remove</button></li>))}</ul>
      <button type="button" className="primary" onClick={checkout}>Checkout</button>
    </>
  )
}
