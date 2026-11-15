'use client'

import { useState } from 'react'
import { bag } from '@/lib/bag'

type Size = { id: string; label: string; price: number; canBuy: boolean }

/** Sizes as buttons (Indian shoppers pick by tapping), then Add to bag. A sold-out size can't be picked. */
export function AddToBag({ title, sizes }: { title: string; sizes: Size[] }) {
  const [pick, setPick] = useState<string | null>(sizes.length === 1 ? sizes[0]!.id : null)
  const [added, setAdded] = useState(false)
  const chosen = sizes.find((s) => s.id === pick)
  return (
    <div className="buy">
      {sizes.length > 1 ? <div role="radiogroup" aria-label="Size" className="sizes">
        {sizes.map((s) => <button key={s.id} type="button" role="radio" aria-checked={pick === s.id} disabled={!s.canBuy} onClick={() => { setPick(s.id); setAdded(false) }}>{s.label}</button>)}
      </div> : null}
      <button type="button" className="primary" disabled={!chosen} onClick={() => { if (chosen) { bag.add({ variantId: chosen.id, title, size: chosen.label, price: chosen.price }); setAdded(true) } }}>
        {added ? 'Added to bag' : chosen ? 'Add to bag' : 'Pick a size'}
      </button>
      <p role="status" className="sr-only">{added ? 'Added to bag' : ''}</p>
    </div>
  )
}
