'use client'

import type { Dispatch, SetStateAction } from 'react'
import { OfferProgress } from './bag-quote'
import { bag, offerCode } from './bag-store'
import { inr, type PublicListed, type PublicQuote } from './shop-client'

// =============================================================================
// FILE: src/components/storefront/checkout-offers.tsx — the checkout's offers: those listed for this bag, how far the
// nearest one is, and the code line. In its own chunk (checkout's first-load budget, check:storefront-build): it shows
// only once the bag is priced, and the checkout loads it on mount, while the price is on its way. The typed code's
// state stays in checkout.tsx.
// =============================================================================

/** What a listed offer says it needs, in the shopper's words (the server decides; this only phrases it). */
function needText(n: PublicListed['need']): string {
  if (!n) return 'Applied'
  if (n.kind === 'add') return `Add ${inr(n.amount)} more`
  if (n.kind === 'add_items') return `Add ${n.n} more ${n.n === 1 ? 'piece' : 'pieces'}`
  if (n.kind === 'gift') return 'Your free gift: add it to the bag'
  if (n.kind === 'first_order') return 'For your first order'
  if (n.kind === 'pay_on_delivery') return 'When you pay on delivery'
  return 'When you pay online'
}

export default function CheckoutOffers({ q, code, typing, setTyping, draftCode, setDraftCode, field, sect }: {
  q: PublicQuote | null; code: string; typing: boolean; setTyping: (on: boolean) => void; draftCode: string
  setDraftCode: Dispatch<SetStateAction<string>>; field: string; sect: string }) {
  if (!q) return null
  return <>
    {q.offers.listed.length > 0 || code || typing ? <>
      <h2 className={sect}>Offers</h2>
      <ul className="space-y-2 text-sm" aria-label="Offers for this bag">
        {q.offers.listed.map((l) => (
          <li key={`${l.title}-${l.code ?? ''}`} className={`flex items-center gap-2 rounded-sm border p-2.5 ${l.applied ? 'border-store-good' : 'border-dashed border-store-line'}`}>
            <span aria-hidden className={l.applied ? 'text-store-good' : 'text-store-sub'}>{l.applied ? '✓' : '○'}</span>
            <span className="min-w-0 flex-1"><b className="font-medium">{l.title}</b>{l.code ? <span className="ml-1.5 rounded-sm border border-store-line px-1 font-mono text-xs">{l.code}</span> : null}
              <span className="block text-store-sub">{needText(l.need)}</span></span>
            {l.need?.kind === 'gift' ? <button type="button" className="min-h-11 shrink-0 rounded-sm border border-store-ink px-3 text-sm font-medium" onClick={() => bag.add((l.need as { variantId: string }).variantId, 1, 'keep')}>Add it</button> : null}
          </li>
        ))}
      </ul>
    </> : null}
    <OfferProgress q={q} />
    {code ? ( // feedback-ok: rule 5 — a code that doesn't apply stays on its line
      <p className="mt-2 text-sm" aria-live="polite">Code <b className="font-mono">{code}</b>{q.offers.code === 'applied' ? ' applied.' : q.offers.code === 'beaten' ? ' — a better offer is already applied.' : <span className="text-store-bad"> — this code doesn’t work here.</span>}
        {' '}<button type="button" className="min-h-11 underline" onClick={() => { offerCode.set(''); setDraftCode('') }}>Remove</button></p>
    ) : typing ? (
      <div className="mt-2 flex gap-2">
        <label htmlFor="offer-code" className="sr-only">Offer code</label>
        <input id="offer-code" value={draftCode} maxLength={20} autoCapitalize="characters" placeholder="Code" onChange={(e) => setDraftCode(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase())}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (draftCode) offerCode.set(draftCode) } }} className={`${field} font-mono`} />
        <button type="button" disabled={!draftCode} onClick={() => offerCode.set(draftCode)} className="h-11 shrink-0 rounded-sm border border-store-ink px-4 text-sm font-medium disabled:opacity-50">Apply</button>
      </div>
    ) : <button type="button" className="mt-1 min-h-11 text-sm underline" onClick={() => setTyping(true)}>Have a code?</button>}
  </>
}
