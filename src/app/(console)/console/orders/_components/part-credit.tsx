'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'

// =============================================================================
// A credit note for a delivered order (GST phase 2; approved mockup "Part credit note"): items that came back, by line
// and quantity, or a discount after the sale — agreed before the sale (reduces GST) or goodwill (GST unchanged). Each
// is final once issued; the dialog says so in its title.
// =============================================================================

export type PartLine = { id: string; title: string; qty: number; left: number }
export type PartRequest = { kind: 'return'; lines: Record<string, number> } | { kind: 'discount'; amount: number; agreed: boolean }

export function PartCreditDialog({ open, number, lines, inclusive, busy, onClose, onIssue }: {
  open: boolean; number: string; lines: PartLine[]; inclusive: boolean; busy: boolean
  onClose: () => void; onIssue: (r: PartRequest) => void
}) {
  const [kind, setKind] = useState<'return' | 'discount'>('return')
  const [qty, setQty] = useState<Record<string, number>>({})
  const [agreed, setAgreed] = useState(true)
  const [amount, setAmount] = useState('')
  const rupees = Number(amount.replace(/[₹,\s]/g, ''))
  const can = kind === 'return' ? Object.values(qty).some((n) => n > 0) : Number.isFinite(rupees) && rupees >= 1
  const issue = () => onIssue(kind === 'return' ? { kind, lines: Object.fromEntries(Object.entries(qty).filter(([, n]) => n > 0)) } : { kind, amount: Math.round(rupees * 100), agreed })
  const seg = (k: 'return' | 'discount', label: string) => (
    <button type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
      className={`min-h-9 flex-1 rounded-md px-3 text-sm font-medium transition-[background-color,color] duration-fast ${kind === k ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{label}</button>
  )
  return (
    <Dialog open={open} onClose={onClose} title={`Credit note for ${number}`} description="Final once issued: it can’t be changed or taken back."
      actions={<><Button variant="secondary" data-autofocus onClick={onClose}>Not now</Button><Button onClick={issue} disabled={!can || busy}>{busy ? 'Issuing…' : 'Issue credit note'}</Button></>}>
      <div className="space-y-4">
        <div role="radiogroup" aria-label="What it credits" className="flex gap-0.5 rounded-lg bg-muted p-0.5">{seg('return', 'Returned items')}{seg('discount', 'Discount after the sale')}</div>
        {kind === 'return' ? (
          <ul className="space-y-2">
            {lines.map((l) => {
              const n = qty[l.id] ?? 0
              const step = (d: number) => setQty((x) => ({ ...x, [l.id]: Math.max(0, Math.min(l.left, (x[l.id] ?? 0) + d)) }))
              return (
                <li key={l.id} className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
                  <span className="min-w-0 flex-1 text-sm">{l.title}</span>
                  {l.left ? <>
                    <span className="inline-flex items-center rounded-md border border-input">
                      <button type="button" aria-label={`Fewer ${l.title}`} disabled={!n} onClick={() => step(-1)} className="grid size-8 place-items-center disabled:opacity-40">−</button>
                      <span className="w-6 text-center font-mono text-sm tabular-nums" aria-live="polite">{n}</span>
                      <button type="button" aria-label={`More ${l.title}`} disabled={n >= l.left} onClick={() => step(1)} className="grid size-8 place-items-center disabled:opacity-40">+</button>
                    </span>
                    <span className="w-10 text-right text-xs text-muted-foreground">of {l.left}</span>
                  </> : <span className="text-xs text-muted-foreground">Credited</span>}
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="space-y-3">
            <div role="radiogroup" aria-label="Kind of discount" className="grid gap-2 sm:grid-cols-2">
              {([[true, 'Agreed before the sale', 'Reduces GST'], [false, 'Goodwill', 'GST unchanged']] as const).map(([v, label, note]) => (
                <button key={label} type="button" role="radio" aria-checked={agreed === v} onClick={() => setAgreed(v)}
                  className={`flex items-start gap-3 rounded-lg border p-3 text-left ${agreed === v ? 'border-foreground shadow-[inset_0_0_0_1px_var(--color-foreground)]' : 'border-border'}`}>
                  <span aria-hidden="true" className={`mt-0.5 size-4 shrink-0 rounded-full border-2 ${agreed === v ? 'border-[5px] border-foreground' : 'border-input'}`} />
                  <span><span className="block text-sm font-medium">{label}</span><span className="block text-xs text-muted-foreground">{note}</span></span>
                </button>
              ))}
            </div>
            <div className="space-y-1">
              <label htmlFor="pc-amount" className="block text-sm font-medium">Amount{agreed && inclusive ? ' (with GST)' : ''}</label>
              <div className="flex items-center gap-1.5"><span className="text-sm text-muted-foreground">₹</span>
                <input id="pc-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-10 w-40 rounded-md border border-input bg-card px-3 font-mono text-sm md:h-9" /></div>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}
