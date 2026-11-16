'use client'

import { useEffect, useState } from 'react'
import { pick, urlFor } from '@/domains/media/sizes'
import { inr, type PublicQuote } from './shop-client'
import { bag } from './bag-store'
import { OfferProgress, OfferRows, useQuote } from './bag-quote'
import { ADDED_TO_BAG, PRICING_BAG } from './bag-words'

const kindLine = (l: PublicQuote['lines'][number]) => l.kind === 'preorder' && l.shipsBy ? `Pre-order · ships by ${new Date(`${l.shipsBy}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}`
  : l.kind === 'made_to_order' ? `Made to order · ${l.leadMinDays}–${l.leadMaxDays} days to make` : null

/** The bag's lines with − / + and Remove, and every charge named before checkout. One component: drawer and page. */
export function BagContents({ onCheckout, onKeepShopping, added = null }: { onCheckout: () => void; onKeepShopping: () => void
  /** The line Add to bag just put in: the drawer says so and marks it with the theme's accent. */
  added?: string | null }) {
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
      <button type="button" onClick={onKeepShopping} className="store-btn store-buy h-12 w-full rounded-[var(--store-radius)] bg-store-button text-store-on-button">See what is new</button>
    </div>
  )
  const buyable = q?.lines.filter((l) => l.qty > 0) ?? []
  return (
    <div className="space-y-3">
      {added && items.some((i) => i.variantId === added) && <p role="status" className="store-added-note text-sm font-medium">{ADDED_TO_BAG}</p>}
      {notes.map((t) => <p key={t} role="status" className="border-l-2 border-store-accent bg-store-chip px-3 py-2 text-sm">{t}</p>)}
      {/* feedback-ok: rule 4 — the bag drawer is a modal dialog: its own load failure stays inside it (the bag page draws the same lines) */}
      {error && <p role="alert" className="text-sm text-store-bad">{error}</p>}
      <ul className="divide-y divide-store-line">
        {(q?.lines ?? []).map((l) => (
          <li key={l.variantId} data-added={l.variantId === added || undefined} className="store-bag-line flex gap-3 py-3">
            {l.image ? <img src={urlFor(l.image.base, pick(l.image.widths, 160))} alt="" width={56} height={70} data-photo className="h-[70px] w-14 shrink-0 rounded-sm object-cover" /> : <span className="h-[70px] w-14 shrink-0 rounded-sm bg-store-chip" />}
            <div className="min-w-0 flex-1 space-y-1">
              <p className="leading-snug">{l.title}</p>
              <p className="text-sm text-store-sub">{l.values.join(' · ')}</p>
              {kindLine(l) && <p className="text-xs text-store-sub">{kindLine(l)}</p>}
              {/* feedback-ok: a line's state (sold out since it was added), on the line with its Remove */}
              {l.problem === 'sold_out' || l.problem === 'gone' ? <p className="text-sm text-store-bad">{l.problem === 'gone' ? 'No longer sold.' : 'Sold out since you added it.'} <button type="button" className="underline" onClick={() => bag.remove(l.variantId, 'shop')}>Remove</button></p> : (
                <div className="flex items-center justify-between gap-2">
                  <span className="store-qty inline-flex items-center rounded-[var(--store-radius)] border border-store-line">
                    <button type="button" aria-label={`One fewer ${l.title}`} className="grid size-10 place-items-center text-lg" onClick={() => bag.set(l.variantId, l.qty - 1, 'shop')}>−</button>
                    <span className="min-w-6 text-center tabular-nums" aria-live="polite">{l.qty}</span>
                    <button type="button" aria-label={`One more ${l.title}`} className="grid size-10 place-items-center text-lg" disabled={l.qty >= 10} onClick={() => bag.set(l.variantId, l.qty + 1, 'shop')}>+</button>
                  </span>
                  <span className="tabular-nums">{inr(l.unitPrice * l.qty)}</span>
                </div>
              )}
              {l.problem !== 'sold_out' && l.problem !== 'gone' && <button type="button" className="text-xs text-store-sub underline" onClick={() => bag.remove(l.variantId, 'shop')}>Remove</button>}
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
            : <p className="text-store-sub">{q.codWhy}</p>}
          <p className="flex justify-between pt-1 text-base font-medium"><span>Total</span><span className="store-price tabular-nums">{inr(q.prepaid)}</span></p>
          <button type="button" onClick={onCheckout} className="store-btn store-buy mt-2 h-12 w-full rounded-[var(--store-radius)] bg-store-button text-base font-medium text-store-on-button">Checkout</button>
          <button type="button" onClick={onKeepShopping} className="store-btn-2 h-12 w-full rounded-[var(--store-radius)] border border-store-ink">Keep shopping</button>
        </div>
      )}
      {!q && !error && <p className="text-sm text-store-sub">{PRICING_BAG}</p>}
    </div>
  )
}
