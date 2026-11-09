'use client'

import { useState } from 'react'
import { bag, openBag } from './bag-store'

/** Signal S3: Add for a paired piece with one size (its only variant goes in the bag, then the bag opens). Tiny on
 *  purpose: the rows and photos around it are drawn on the server. */
export function PairAdd({ variantId, label, done, sr, live, preview }: { variantId: string; label: string; done: string; sr: string; live: boolean; preview: string }) {
  const [added, setAdded] = useState(false)
  const [note, setNote] = useState(false)
  return (
    <>
      <button type="button" aria-label={sr} className="store-pair-btn min-h-11 shrink-0 rounded-[var(--store-radius)] bg-store-button px-3 text-xs font-bold uppercase tracking-wider text-store-on-button"
        onClick={() => { if (!live) { setNote(true); return } bag.add(variantId, 1); setAdded(true); openBag(variantId) }}>{added ? done : label}</button>
      {note && <span role="alert" className="col-span-full text-xs text-store-sub">{preview}</span>}
    </>
  )
}
