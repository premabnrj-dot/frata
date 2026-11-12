'use client'

import { Money } from '@/components/data/numeric'
import { Button } from '@/components/ui/button'
import { LOW_STOCK_AT } from '@/domains/catalogue/availability'
import { pick, urlFor } from '@/domains/media/sizes'
import { paise } from '@/domains/money/paise'
import { EDIT_REASONS, REASON_LABEL, type Choice, type EditReason } from '@/domains/orders/edit'
import { cn } from '@/lib/utils'

// =============================================================================
// FILE: src/app/(console)/console/orders/_components/edit/edit-line.tsx
//
// ONE LINE BEING EDITED (design-language § Import and order edit): the product's other sizes and colours as chips with
// what is left ("L · 2 left"; the one sold dashed; none left crossed through and not choosable), − / +, and Remove
// with a reason; a removed line says why and can be put back. A line whose product was deleted can only be removed.
// =============================================================================

export type RowView = {
  key: string; title: string; image: { base: string; widths: number[] } | null
  /** The variant sold on this line (dashed); null for an added piece or a deleted product. */
  soldVariant: string | null
  /** Added in this edit: it comes out without a reason. */
  added: boolean
  variantId: string | null; qty: number; unitPrice: number
  /** The product's sizes and colours, with how many can be had; empty: no longer sold. */
  choices: Choice[]; room: Record<string, number>; options: string[]
  removed: EditReason | null
}

const chip = 'inline-flex min-h-10 items-center gap-1 rounded-full border border-input bg-card px-3 text-xs font-medium md:min-h-8'
const label = (c: Choice) => c.values.join(' · ') || c.title

export function EditLine({ row, onPick, onQty, onRemove, onBack, asking, onAsk }: {
  row: RowView
  onPick: (variantId: string) => void
  onQty: (qty: number) => void
  onRemove: (reason: EditReason) => void
  onBack: () => void
  asking: boolean
  onAsk: (open: boolean) => void
}) {
  const own = row.variantId === row.soldVariant
  // More pieces of the line's own size need room; fewer never do.
  const most = Math.min(10, Math.max(own ? Math.max(row.qty, row.room[row.variantId ?? ''] ?? 0) : row.room[row.variantId ?? ''] ?? 0, row.qty))
  const gone = row.variantId === null || !row.choices.length
  return (
    <li className={cn('grid grid-cols-[3rem_minmax(0,1fr)_auto] items-start gap-3 py-3 first:pt-0', row.removed && 'opacity-60')}>
      {row.image ? <img src={urlFor(row.image.base, pick(row.image.widths, 160))} alt="" width={48} height={60} className="h-[60px] w-12 rounded-sm object-cover" /> : <span aria-hidden className="h-[60px] w-12 rounded-sm bg-muted" />}
      <div className="grid min-w-0 gap-2 text-sm">
        <span className={cn('font-medium', row.removed && 'line-through')}>{row.title}</span>
        {row.removed ? (
          <span className="flex flex-wrap items-center gap-2">
            <span>Removed · {REASON_LABEL[row.removed].toLowerCase()}</span>
            <Button variant="ghost" onClick={onBack}>Put it back</Button>
          </span>
        ) : (
          <>
            {gone ? <span className="text-muted-foreground">No longer sold</span> : row.choices.length > 1 || !own ? (
              <div role="group" aria-label={row.options.join(' and ') || 'Options'} className="flex flex-wrap gap-1.5">
                {row.choices.map((c) => {
                  const left = row.room[c.variantId] ?? 0, mine = c.variantId === row.soldVariant, on = c.variantId === row.variantId
                  const out = left <= 0 && !mine
                  return (
                    <button key={c.variantId} type="button" aria-pressed={on} disabled={out && !on} onClick={() => onPick(c.variantId)}
                      className={cn(chip, on && 'border-primary bg-primary text-primary-foreground', mine && !on && 'border-dashed', out && !on && 'cursor-not-allowed line-through opacity-50')}>
                      {label(c)}{on && left > 0 && left <= LOW_STOCK_AT && !mine ? <span className="font-mono">· {left} left</span> : null}
                    </button>
                  )
                })}
              </div>
            ) : null}
            <span className="flex flex-wrap items-center gap-2">
              {gone ? null : (
                <span className="inline-flex items-center rounded-md border border-input">
                  <button type="button" aria-label="One less" disabled={row.qty <= 1} onClick={() => onQty(row.qty - 1)} className="min-h-10 w-10 text-base font-semibold disabled:opacity-40 md:min-h-8 md:w-8">−</button>
                  <span className="min-w-7 text-center font-mono tabular-nums" aria-live="polite">{row.qty}</span>
                  <button type="button" aria-label="One more" disabled={row.qty >= most} onClick={() => onQty(row.qty + 1)} className="min-h-10 w-10 text-base font-semibold disabled:opacity-40 md:min-h-8 md:w-8">+</button>
                </span>
              )}
              {asking ? (
                <span role="group" aria-label={`Why ${row.title} comes out`} className="flex flex-wrap items-center gap-1.5">
                  {EDIT_REASONS.map((r) => <button key={r} type="button" className={chip} onClick={() => onRemove(r)}>{REASON_LABEL[r]}</button>)}
                  <Button variant="ghost" onClick={() => onAsk(false)}>Keep it</Button>
                </span>
              ) : <Button variant="ghost" onClick={() => (row.added ? onRemove('other') : onAsk(true))}>Remove</Button>}
            </span>
          </>
        )}
      </div>
      <span className="text-right font-mono text-sm tabular-nums">
        {row.removed ? <s className="text-muted-foreground"><Money paise={paise(row.unitPrice * row.qty)} /></s> : <>{row.qty > 1 ? `${row.qty} × ` : ''}<Money paise={paise(row.unitPrice)} /></>}
      </span>
    </li>
  )
}
