'use client'

import { useState } from 'react'
import { announce } from '@/components/shell/announce'
import { Button } from '@/components/ui/button'
import { FIELD } from '@/components/ui/field'
import { cn } from '@/lib/utils'

// =============================================================================
// THE BULK BAR (Neel N2, mockup § Stock and prices: "Gulabi · 6 sizes selected · Price · Stock · Empty only · Set").
// Acts on the selected rows; "Empty only" (on by default) leaves a size priced or stocked on its own alone (PR·0: "Set
// every price" overwrote XXL's ₹2,890). Set says what it did once ("Price set on 6 variants"). An inline group, not a
// floating bar: it never covers a row.
// =============================================================================

export function BulkBar({ what, count, onSet, onClear }: {
  /** "Gulabi · 6 sizes" or "4 variants". */
  what: string; count: number
  /** Returns how many rows each field was set on. */
  onSet: (v: { price: string; stock: string; emptyOnly: boolean }) => { price: number; stock: number }
  onClear: () => void
}) {
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('')
  const [emptyOnly, setEmptyOnly] = useState(true)
  return (
    <div role="group" aria-label="Set the selected rows" onKeyDown={(e) => { if (e.key === 'Escape') onClear() }}
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-sunk px-3 py-2 text-sm">
      <span role="status" className="mr-auto font-medium">{what} selected</span>
      <label className="flex items-center gap-1.5 text-muted-foreground">Price
        <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={cn(FIELD, 'w-24 font-num tabular-nums')} />
      </label>
      <label className="flex items-center gap-1.5 text-muted-foreground">Stock
        <input inputMode="numeric" value={stock} onChange={(e) => setStock(e.target.value)} className={cn(FIELD, 'w-20 font-num tabular-nums')} />
      </label>
      <label className="flex min-h-11 items-center gap-1.5 md:min-h-6"><input type="checkbox" checked={emptyOnly} onChange={(e) => setEmptyOnly(e.target.checked)} />Empty only</label>
      <Button variant="secondary" size="sm" disabled={!count || (!price && !stock)}
        onClick={() => {
          const n = onSet({ price, stock, emptyOnly })
          const said = [n.price ? `Price set on ${n.price}` : '', n.stock ? `Stock set on ${n.stock}` : ''].filter(Boolean).join(', ')
          announce(said ? `${said} ${Math.max(n.price, n.stock) === 1 ? 'variant' : 'variants'}.` : 'Nothing was empty. No row changed.')
        }}>Set</Button>
      <Button variant="ghost" size="sm" onClick={onClear}>Clear</Button>
    </div>
  )
}
