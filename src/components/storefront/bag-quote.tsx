'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api, inr, type PublicQuote } from './shop-client'
import { useBag, useOfferCode } from './bag-store'
import { saysOnline } from '@/domains/checkout/offer-text'

// The bag's price from the server and its offer lines: the bag's lines (bag-contents.tsx) and the checkout read them.
// Apart from the header's bag button (bag.tsx), so a shop page loads none of it until the bag opens.

/** Re-price the bag on the server whenever it changes; the bag follows what can be bought. */
export function useQuote(pincode?: string) {
  const items = useBag()
  const code = useOfferCode()
  const [q, setQ] = useState<PublicQuote | null>(null)
  // Online payment on this address (keys live and, on live keys, the address approved in Razorpay: D1·8).
  const [online, setOnline] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // A half-typed pincode is not a new price: only a whole one re-prices the bag (and re-sends the code).
  const pin = pincode && /^[1-9][0-9]{5}$/.test(pincode) ? pincode : null
  const key = JSON.stringify([items, pin, code])
  const seq = useRef(0)
  const refresh = useCallback(async () => {
    if (!items.length) { setQ(null); return null }
    const n = ++seq.current
    setLoading(true)
    const r = await api<{ quote: PublicQuote; online: boolean }>('/api/shop/quote', { bag: items, ...(pincode && /^[1-9][0-9]{5}$/.test(pincode) ? { pincode } : {}), ...(code ? { code } : {}) })
    if (n !== seq.current) return null
    setLoading(false)
    if (!r.ok) { setError(r.data.error ?? 'Could not load your bag.'); return null }
    setError(null); setQ(r.data.quote); setOnline(r.data.online !== false)
    return r.data.quote
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void refresh() }, [refresh])
  return { items, q, online, error, loading, refresh }
}

/**
 * What each offer saved (offers spec § Showcase): the order offer, free delivery, and the pay-online saving marked as
 * such. Titles and amounts come from the server; nothing is worked out here.
 */
export function OfferRows({ applied }: { applied: PublicQuote['appliedPrepaid'] }) {
  return <>{applied.map((a, i) => (
    <p key={`${a.class}-${i}`} className="flex justify-between text-store-good"><span>{savingName(a)}</span><span className="tabular-nums">−{inr(a.amount)}</span></p>
  ))}</>
}

/** An offer's name with what it is, said once: "Pay online, save" already says online, so no "(paying online)" after it. */
function savingName(a: { class: string; title: string }): string {
  if (a.class === 'payment') return saysOnline(a.title) ? a.title : `${a.title} (paying online)`
  if (a.class === 'shipping') return /free (delivery|shipping)/i.test(a.title) ? a.title : `${a.title}: free delivery`
  return a.title
}

/** The nearest listed offer the bag misses by an amount: "₹420 more for Diwali". One line, never a timer. */
export function OfferProgress({ q }: { q: PublicQuote }) {
  const near = q.offers.listed.filter((l) => l.need?.kind === 'add').sort((a, b) => (a.need as { amount: number }).amount - (b.need as { amount: number }).amount)[0]
  if (!near || near.need?.kind !== 'add') return null
  return <p className="rounded-sm bg-store-chip px-3 py-2 text-sm"><b className="tabular-nums">{inr(near.need.amount)} more</b> for {near.title}</p>
}
