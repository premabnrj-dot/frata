'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { pick, urlFor } from '@/domains/media/sizes'
import { api, codWhyNotText, inr, type PublicQuote } from './shop-client'
import { bag, captureAttribution, useBag, useOfferCode } from './bag-store'

/** Re-price the bag on the server whenever it changes; the bag follows what can be bought. */
export function useQuote(pincode?: string) {
  const items = useBag()
  const code = useOfferCode()
  const [q, setQ] = useState<PublicQuote | null>(null)
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
    const r = await api<{ quote: PublicQuote }>('/api/shop/quote', { bag: items, ...(pincode && /^[1-9][0-9]{5}$/.test(pincode) ? { pincode } : {}), ...(code ? { code } : {}) })
    if (n !== seq.current) return null
    setLoading(false)
    if (!r.ok) { setError(r.data.error ?? 'Could not load your bag.'); return null }
    setError(null); setQ(r.data.quote)
    return r.data.quote
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void refresh() }, [refresh])
  return { items, q, error, loading, refresh }
}

const kindLine = (l: PublicQuote['lines'][number]) => l.kind === 'preorder' && l.shipsBy ? `Pre-order · ships by ${new Date(`${l.shipsBy}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}`
  : l.kind === 'made_to_order' ? `Made to order · ${l.leadMinDays}–${l.leadMaxDays} days to make` : null

/** The bag's lines with − / + and Remove, and every charge named before checkout. One component: drawer and page. */
export function BagContents({ onCheckout, onKeepShopping }: { onCheckout: () => void; onKeepShopping: () => void }) {
  const { items, q, error } = useQuote()
  // Lines the server says are gone or were cut: the bag follows, and says so once.
  const [notes, setNotes] = useState<string[]>([])
  useEffect(() => {
    if (!q) return
    const n: string[] = []
    if (q.missing.length) n.push('An item in your bag is no longer sold. It was removed.')
    for (const l of q.lines) if (l.problem === 'reduced') n.push(`Only ${l.qty} of ${l.title} can be bought — quantity set to ${l.qty}.`)
    if (n.length) { setNotes(n); bag.reconcile(q.lines.filter((l) => l.problem === 'reduced'), q.missing) }
  }, [q])

  if (!items.length) return (
    <div className="py-10 text-center">
      <p className="mb-4">Your bag is empty.</p>
      <button type="button" onClick={onKeepShopping} className="h-12 w-full rounded-sm bg-store-ink text-store-paper">See what is new</button>
    </div>
  )
  const buyable = q?.lines.filter((l) => l.qty > 0) ?? []
  return (
    <div className="space-y-3">
      {notes.map((t) => <p key={t} role="status" className="border-l-2 border-store-accent bg-store-chip px-3 py-2 text-sm">{t}</p>)}
      {error && <p role="alert" className="text-sm text-store-bad">{error}</p>}
      <ul className="divide-y divide-store-line">
        {(q?.lines ?? []).map((l) => (
          <li key={l.variantId} className="flex gap-3 py-3">
            {l.image ? <img src={urlFor(l.image.base, pick(l.image.widths, 160))} alt="" width={56} height={70} className="h-[70px] w-14 shrink-0 rounded-sm bg-store-chip object-cover" /> : <span className="h-[70px] w-14 shrink-0 rounded-sm bg-store-chip" />}
            <div className="min-w-0 flex-1 space-y-1">
              <p className="leading-snug">{l.title}</p>
              <p className="text-sm text-store-sub">{l.values.join(' · ')}</p>
              {kindLine(l) && <p className="text-xs text-store-sub">{kindLine(l)}</p>}
              {l.problem === 'sold_out' || l.problem === 'gone' ? <p className="text-sm text-store-bad">{l.problem === 'gone' ? 'No longer sold.' : 'Sold out since you added it.'} <button type="button" className="underline" onClick={() => bag.remove(l.variantId)}>Remove</button></p> : (
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center rounded-sm border border-store-line">
                    <button type="button" aria-label={`One fewer ${l.title}`} className="grid size-10 place-items-center text-lg" onClick={() => bag.set(l.variantId, l.qty - 1)}>−</button>
                    <span className="min-w-6 text-center tabular-nums" aria-live="polite">{l.qty}</span>
                    <button type="button" aria-label={`One more ${l.title}`} className="grid size-10 place-items-center text-lg" disabled={l.qty >= 10} onClick={() => bag.set(l.variantId, l.qty + 1)}>+</button>
                  </span>
                  <span className="tabular-nums">{inr(l.unitPrice * l.qty)}</span>
                </div>
              )}
              {l.problem !== 'sold_out' && l.problem !== 'gone' && <button type="button" className="text-xs text-store-sub underline" onClick={() => bag.remove(l.variantId)}>Remove</button>}
            </div>
          </li>
        ))}
      </ul>
      {q && buyable.length > 0 && (
        <div className="space-y-1 border-t border-store-line pt-3 text-sm">
          <OfferProgress q={q} />
          <OfferRows applied={q.appliedPrepaid} />
          <p className="flex justify-between"><span>Delivery</span><span>{q.shipping ? inr(q.shipping) : 'Free'}</span></p>
          {q.cod ? q.cod.charge > 0 && <p className="flex justify-between text-store-sub"><span>Pay on delivery adds {inr(q.cod.charge)}</span><span>if you choose it</span></p>
            : <p className="text-store-sub">{codWhyNotText(q.codWhyNot)}</p>}
          <p className="flex justify-between pt-1 text-base font-medium"><span>Total</span><span className="tabular-nums">{inr(q.prepaid)}</span></p>
          <button type="button" onClick={onCheckout} className="mt-2 h-12 w-full rounded-sm bg-store-ink text-base font-medium text-store-paper">Checkout</button>
          <button type="button" onClick={onKeepShopping} className="h-12 w-full rounded-sm border border-store-ink">Keep shopping</button>
        </div>
      )}
      {!q && !error && <p className="text-sm text-store-sub">Pricing your bag…</p>}
    </div>
  )
}

/**
 * What each offer saved (offers spec § Showcase): the order offer, free delivery, and the pay-online saving marked as
 * such. Titles and amounts come from the server; nothing is worked out here.
 */
export function OfferRows({ applied }: { applied: PublicQuote['appliedPrepaid'] }) {
  return <>{applied.map((a, i) => (
    <p key={`${a.class}-${i}`} className="flex justify-between text-store-good"><span>{a.class === 'payment' ? `${a.title} (paying online)` : a.class === 'shipping' ? `${a.title}: free delivery` : a.title}</span><span className="tabular-nums">−{inr(a.amount)}</span></p>
  ))}</>
}

/** The nearest listed offer the bag misses by an amount: "₹420 more for Diwali". One line, never a timer. */
export function OfferProgress({ q }: { q: PublicQuote }) {
  const near = q.offers.listed.filter((l) => l.need?.kind === 'add').sort((a, b) => (a.need as { amount: number }).amount - (b.need as { amount: number }).amount)[0]
  if (!near || near.need?.kind !== 'add') return null
  return <p className="rounded-sm bg-store-chip px-3 py-2 text-sm"><b className="tabular-nums">{inr(near.need.amount)} more</b> for {near.title}</p>
}

/** The header's bag button and the drawer it opens (also opened by Add to bag). */
export function BagButton({ checkoutHref, shopHref, label = 'Bag', count = ['Bag, 1 item', 'Bag, {n} items'] }: { checkoutHref: string; shopHref: string; label?: string
  /** The button's name with a count, one and many (the shop's words; the name starts with the visible label). */
  count?: [string, string] }) {
  const items = useBag()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { captureAttribution() }, [])
  useEffect(() => {
    const o = () => setOpen(true)
    window.addEventListener('frata:open-bag', o)
    return () => window.removeEventListener('frata:open-bag', o)
  }, [])
  useEffect(() => { if (open && !ref.current?.open) ref.current?.showModal(); if (!open) ref.current?.close() }, [open])
  const n = items.reduce((a, i) => a + i.qty, 0)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="whitespace-nowrap px-2 py-2 text-sm" aria-label={(n === 1 ? count[0] : count[1]).replace('{n}', String(n))}>{label}{n ? ` · ${n}` : ''}</button>
      <dialog ref={ref} onClose={() => setOpen(false)} aria-label="Your bag"
        className="m-0 ml-auto h-dvh max-h-none w-full max-w-md overflow-y-auto bg-store-paper p-0 text-store-ink backdrop:bg-black/40">
        {open && (
          <div className="p-5">
            <div className="mb-2 flex items-center justify-between"><h2 className="text-lg font-medium">Your bag</h2><button type="button" onClick={() => setOpen(false)} className="grid size-11 place-items-center text-xl" aria-label="Close bag">×</button></div>
            <BagContents onCheckout={() => { window.location.href = checkoutHref }} onKeepShopping={() => { setOpen(false); if (!n) window.location.href = shopHref }} />
          </div>
        )}
      </dialog>
    </>
  )
}
