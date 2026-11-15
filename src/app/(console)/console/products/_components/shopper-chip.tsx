'use client'

import type { WhenOut } from '@/domains/catalogue/availability'
import { badge } from '@/components/ui/badge'
import { FieldError, fieldProps } from '@/components/ui/field-error'
import { FIELD } from '@/components/ui/field'
import { Popover } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { Cell } from './variant-grid'

// =============================================================================
// SHOPPERS SEE (Neel N2, mockup § Stock and prices): a row's chip says what a shopper sees now (In stock, Sold out, No
// price yet, Pre-order …), derived, never typed. It is a button: it opens what happens when the row runs out (stop, take
// pre-orders until a date and a cap, make to order in N days) — live features the board did not draw (Deviations). A
// mistake in those fields marks the chip and opens it (the editor's save).
// =============================================================================

const WHEN_OUT: [WhenOut, string][] = [['stop', 'Stop selling'], ['preorder', 'Take pre-orders'], ['made_to_order', 'Make to order']]
const TONE = { in_stock: 'ok', low_stock: 'warn', sold_out: 'warn', preorder: 'info', made_to_order: 'info', none: 'neutral' } as const

export function ShopperChip({ k, name, cell, sees, unpriced, onChange, errors, open, onOpenChange }: {
  k: string; name: string; cell: Cell; sees: { kind: keyof typeof TONE; label: string }; unpriced: boolean
  onChange: (patch: Partial<Cell>) => void; errors: Record<string, string>
  open: boolean; onOpenChange: (open: boolean) => void
}) {
  const label = unpriced ? 'No price yet' : sees.label
  const tone = unpriced ? 'neutral' : TONE[sees.kind]
  const err = (f: string) => errors[`v:${k}:${f}`]
  const marked = ['shipsBy', 'cap', 'lead'].some((f) => err(f))
  return (
    <Popover title={`When ${name} runs out`} open={open} onOpenChange={onOpenChange}
      trigger={(w) => (
        <button type="button" {...w} aria-invalid={marked || undefined} aria-label={`Shoppers see: ${label}. Change when it runs out`}
          className={cn(badge({ tone: marked ? 'danger' : tone }), 'relative cursor-pointer after:absolute after:-inset-3 hover:underline md:after:-inset-1')}>{label}</button>
      )}>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-label font-medium">When it runs out
          <select className={FIELD} value={cell.whenOut ?? 'stop'} onChange={(e) => onChange({ whenOut: e.target.value as WhenOut })}>
            {WHEN_OUT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        {cell.whenOut === 'preorder' ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-label font-medium">Ships by
              <input type="date" className={FIELD} value={cell.shipsBy ?? ''} onChange={(e) => onChange({ shipsBy: e.target.value })} {...fieldProps(`v:${k}:shipsBy`, err('shipsBy'))} />
              <FieldError name={`v:${k}:shipsBy`} message={err('shipsBy')} />
            </label>
            <label className="flex flex-col gap-1.5 text-label font-medium">Most pre-orders
              <input inputMode="numeric" placeholder="No limit" className={FIELD} value={cell.cap ?? ''} onChange={(e) => onChange({ cap: e.target.value })} {...fieldProps(`v:${k}:cap`, err('cap'))} />
              <FieldError name={`v:${k}:cap`} message={err('cap')} />
            </label>
          </div>
        ) : null}
        {cell.whenOut === 'made_to_order' ? (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-label font-medium">Days to make</legend>
            <div className="flex items-center gap-2">
              <input inputMode="numeric" placeholder="7" aria-label="Fewest days" className={cn(FIELD, 'w-20')} value={cell.leadMin ?? ''} onChange={(e) => onChange({ leadMin: e.target.value })} {...fieldProps(`v:${k}:lead`, err('lead'))} />
              <span aria-hidden="true">–</span>
              <input inputMode="numeric" placeholder="10" aria-label="Most days" className={cn(FIELD, 'w-20')} value={cell.leadMax ?? ''} onChange={(e) => onChange({ leadMax: e.target.value })} />
            </div>
            <FieldError name={`v:${k}:lead`} message={err('lead')} />
          </fieldset>
        ) : null}
      </div>
    </Popover>
  )
}
