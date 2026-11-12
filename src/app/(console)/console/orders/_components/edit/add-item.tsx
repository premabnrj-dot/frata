'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Money } from '@/components/data/numeric'
import { paise } from '@/domains/money/paise'
import type { AddResult } from '@/lib/queries/order-edit'
import { findItemsToAdd } from '../../edit-actions'
import { cn } from '@/lib/utils'

// =============================================================================
// FILE: src/app/(console)/console/orders/_components/edit/add-item.tsx
//
// "ADD AN ITEM": the shop's pieces by name, each size and colour as a chip (none left crossed through); a chip adds one
// piece at today's price. Sizes already on the order are not offered again (change that line's quantity instead).
// =============================================================================

export function AddItem({ orderId, taken, onAdd }: { orderId: string; taken: Set<string>; onAdd: (r: AddResult, variantId: string) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [found, setFound] = useState<AddResult[] | null>(null)
  const seq = useRef(0)
  const id = useId()
  useEffect(() => {
    const term = q.trim()
    if (!open || term.length < 2) { setFound(null); return }
    const mine = ++seq.current
    const t = setTimeout(() => { void findItemsToAdd(orderId, term).then((r) => { if (seq.current === mine) setFound(r) }, () => { if (seq.current === mine) setFound([]) }) }, 250)
    return () => clearTimeout(t)
  }, [q, open, orderId])
  if (!open) return <Button variant="secondary" className="justify-self-start" onClick={() => setOpen(true)}>Add an item</Button>
  return (
    <div className="grid gap-2 border-t border-border pt-3">
      <label htmlFor={id} className="text-sm font-medium">Add an item</label>
      <div className="flex gap-2">
        <input id={id} type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} maxLength={60} autoComplete="off"
          className="h-10 min-w-0 flex-1 rounded-md border border-input bg-card px-3 text-sm md:h-9" />
        <Button variant="ghost" onClick={() => { setOpen(false); setQ('') }}>Close</Button>
      </div>
      {found && !found.length ? <p className="text-sm text-muted-foreground">No piece called that.</p> : null}
      {found?.length ? (
        <ul className="divide-y divide-border">
          {found.map((r) => (
            <li key={r.productId} className="grid gap-1.5 py-2 text-sm">
              <span className="flex justify-between gap-3"><span className="font-medium">{r.title}</span><span className="font-mono tabular-nums"><Money paise={paise(Math.min(...r.choices.map((c) => c.price)))} /></span></span>
              <div role="group" aria-label={`${r.title}: ${r.options.join(' and ') || 'options'}`} className="flex flex-wrap gap-1.5">
                {r.choices.map((c) => {
                  const out = (r.room[c.variantId] ?? 0) <= 0 || taken.has(c.variantId)
                  return (
                    <button key={c.variantId} type="button" disabled={out} onClick={() => { onAdd(r, c.variantId); setOpen(false); setQ('') }}
                      className={cn('inline-flex min-h-10 items-center rounded-full border border-input bg-card px-3 text-xs font-medium md:min-h-8', out && 'cursor-not-allowed line-through opacity-50')}>
                      {c.values.join(' · ') || 'Add'}
                    </button>
                  )
                })}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
