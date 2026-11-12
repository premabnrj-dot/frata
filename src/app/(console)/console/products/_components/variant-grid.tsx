'use client'

import { useState } from 'react'
import type { VariantInput } from '@/domains/catalogue/product-form'
import { availability, type WhenOut } from '@/domains/catalogue/availability'
import { combinations, groupOption, keyOf, type Option } from '@/domains/catalogue/variants'
import { button } from '@/components/ui/button'
import { useNow } from '@/components/time/now'
import { Icon } from '@/components/icons/icon'
import { FieldError, fieldProps } from '@/components/ui/field-error'

export type Cell = Omit<VariantInput, 'values'>
export const EMPTY_CELL: Cell = { price: '', compareAt: '', cost: '', stock: '0', sku: '', gtin: '', whenOut: 'stop', shipsBy: '', leadMin: '', leadMax: '', cap: '' }

/** What shoppers see for one cell right now: derived, never typed (availability.ts). */
export function shopperSees(c: Cell, now: Date) {
  const lead = Number(c.leadMin) || null
  return availability({ stock: Number(c.stock) || 0, whenOut: c.whenOut ?? 'stop', shipsBy: c.shipsBy || null, leadMinDays: lead, leadMaxDays: Number(c.leadMax) || lead, preorderCap: c.cap ? Number(c.cap) : null }, now)
}
const SEES_TONE = { in_stock: 'text-ok-text', low_stock: 'text-warn-text', sold_out: 'text-danger-text', preorder: 'text-info-text', made_to_order: 'text-info-text' } as const
const WHEN_OUT: [WhenOut, string][] = [['stop', 'Stop selling'], ['preorder', 'Take pre-orders'], ['made_to_order', 'Make to order']]

/**
 * Every size × colour, grouped by colour (collapsed past 12 rows), with "set
 * every price" for the common case and a cell for the rest. The cost column is
 * the merchant's own: it never leaves the console.
 */
export function VariantGrid({ options, cells, onChange, errors, autoSku, costs }: {
  options: Option[]
  cells: Record<string, Cell>
  onChange: (key: string, patch: Partial<Cell>) => void
  errors: Record<string, string>
  /** The SKU a save will make for an empty cell, shown as its placeholder. */
  autoSku: (values: string[]) => string
  /** Whether the cost column is shown (`seesCosts`). */
  costs: boolean
}) {
  const now = useNow()
  const combos = combinations(options)
  const g = groupOption(options)
  const groups = g < 0 ? [{ label: '', rows: combos }] : options[g]!.values.map((v) => ({ label: v, rows: combos.filter((c) => c[g] === v) }))
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [every, setEvery] = useState({ price: '', stock: '', whenOut: '' as WhenOut | '' })
  const collapse = combos.length > 12
  // Fill a colour (or every row) — and by default only what's empty, so a size priced on its own keeps its price
  // (PR·0: "Set every price" overwrote XXL's ₹2,890).
  const [scope, setScope] = useState('')
  const [emptyOnly, setEmptyOnly] = useState(true)
  const scoped = scope ? groups.find((x) => x.label === scope)?.rows ?? [] : combos
  const blank = (c: string[], field: 'price' | 'stock' | 'whenOut') => {
    const v = (cells[keyOf(c)] ?? EMPTY_CELL)[field] ?? ''
    return field === 'price' ? !String(v).trim() || Number(String(v).replace(/[₹,\s]/g, '')) === 0 : field === 'stock' ? !String(v).trim() || String(v).trim() === '0' : !v || v === 'stop'
  }
  const target = (field: 'price' | 'stock' | 'whenOut') => (emptyOnly ? scoped.filter((c) => blank(c, field)) : scoped)
  const fill = (field: 'price' | 'stock' | 'whenOut', value: string) => target(field).forEach((c) => onChange(keyOf(c), { [field]: value }))
  // A cell's mistake is keyed `v:<values>:<field>` (cleanProduct); each input carries that key's marks, so the form's
  // summary focuses the first and every line below its row names it (§ Feedback 3).
  const err = (k: string, f: string) => errors[`v:${k}:${f}`]
  const marks = (k: string, f: string) => fieldProps(`v:${k}:${f}`, err(k, f))
  const FIELDS = ['price', 'compareAt', 'cost', 'stock', 'sku', 'gtin', 'shipsBy', 'cap', 'lead'] as const
  const rowHasErr = (c: string[]) => FIELDS.some((f) => err(keyOf(c), f))

  const rowId = new Map(combos.map((c, i) => [keyOf(c), i]))
  const input = (k: string, f: keyof Cell, label: string, mono = true, w = 'w-24', placeholder?: string) => (
    <div>
      <label htmlFor={`${f}-${rowId.get(k)}`} className="sr-only">{label}</label>
      <input id={`${f}-${rowId.get(k)}`} value={(cells[k] ?? EMPTY_CELL)[f] ?? ''} inputMode={f === 'sku' ? undefined : f === 'gtin' ? 'numeric' : 'decimal'} {...marks(k, f)}
        title={err(k, f)} placeholder={placeholder} onChange={(e) => onChange(k, { [f]: e.target.value })}
        className={`h-8 ${w} rounded-md border border-input bg-card px-2 text-sm ${mono ? 'font-mono' : ''} aria-invalid:border-danger-text aria-invalid:bg-danger`} />
    </div>
  )

  return (
    <div className="space-y-3">
      {combos.length > 1 && <div className="flex flex-wrap items-end gap-3 rounded-md bg-muted/60 p-3">
        {g >= 0 && (
          <div className="space-y-1"><label htmlFor="every-scope" className="block text-xs font-medium">Set for</label>
            <select id="every-scope" value={scope} onChange={(e) => setScope(e.target.value)} className="h-10 md:h-9 rounded-md border border-input bg-card px-2 text-sm">
              <option value="">Every {options[g]!.name.toLowerCase() || 'row'}</option>{groups.map((x) => <option key={x.label} value={x.label}>{x.label}</option>)}</select></div>
        )}
        <div className="space-y-1"><label htmlFor="every-price" className="block text-xs font-medium">Price, ₹</label>
          <div className="flex gap-1.5"><input id="every-price" inputMode="decimal" value={every.price} onChange={(e) => setEvery({ ...every, price: e.target.value })} className="h-10 md:h-9 w-24 rounded-md border border-input bg-card px-2 font-mono text-sm" />
            <button type="button" className={button({ variant: 'secondary' })} disabled={!every.price || !target('price').length} onClick={() => fill('price', every.price)}>Apply to {target('price').length}</button></div></div>
        <div className="space-y-1"><label htmlFor="every-stock" className="block text-xs font-medium">Stock</label>
          <div className="flex gap-1.5"><input id="every-stock" inputMode="numeric" value={every.stock} onChange={(e) => setEvery({ ...every, stock: e.target.value })} className="h-10 md:h-9 w-20 rounded-md border border-input bg-card px-2 font-mono text-sm" />
            <button type="button" className={button({ variant: 'secondary' })} disabled={!every.stock || !target('stock').length} onClick={() => fill('stock', every.stock)}>Apply to {target('stock').length}</button></div></div>
        <div className="space-y-1"><label htmlFor="every-out" className="block text-xs font-medium">When any runs out</label>
          <div className="flex gap-1.5"><select id="every-out" value={every.whenOut} onChange={(e) => setEvery({ ...every, whenOut: e.target.value as WhenOut })} className="h-10 md:h-9 rounded-md border border-input bg-card px-2 text-sm">
            <option value="">Choose…</option>{WHEN_OUT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <button type="button" className={button({ variant: 'secondary' })} disabled={!every.whenOut || !target('whenOut').length} onClick={() => fill('whenOut', every.whenOut)}>Apply to {target('whenOut').length}</button></div></div>
        <label className="flex min-h-10 items-center gap-2 text-sm md:min-h-9"><input type="checkbox" checked={emptyOnly} onChange={(e) => setEmptyOnly(e.target.checked)} />Empty only</label>
      </div>}
      <div className="relative overflow-x-auto rounded-md border border-border">
        {/* On a phone each size and colour becomes a card of labelled fields (data-rows="form", rule 15). */}
        <table data-rows="form" role="table" aria-label="Sizes, colours and stock" className="w-full text-sm">
          <thead role="rowgroup" className="bg-muted/50 text-left text-xs text-muted-foreground"><tr role="row" className="[&>th]:px-2 [&>th]:py-2">
            <th role="columnheader">{options.map((o) => o.name).join(' / ') || 'Product'}</th><th role="columnheader">Price, ₹</th><th role="columnheader" title="The maximum retail price printed on the tag. Shown on the product page as M.R.P. incl. taxes; never sell above it. A struck “was” price comes only from a real price cut in the last 30 days.">M.R.P., ₹</th>{costs ? <th role="columnheader">Your cost, ₹</th> : null}<th role="columnheader">Stock</th><th role="columnheader">When it runs out</th><th role="columnheader">Shoppers see</th><th role="columnheader">SKU</th><th role="columnheader">Barcode</th></tr></thead>
          {groups.map((grp) => {
            // A group with a mistake in it stays open: its marked fields must be there to focus.
            const shut = collapse && grp.label && !open[grp.label] && !grp.rows.some(rowHasErr)
            const sold = grp.rows.filter((c) => !shopperSees(cells[keyOf(c)] ?? EMPTY_CELL, now).canBuy).length
            return (
              <tbody role="rowgroup" key={grp.label || 'all'} className="border-t border-border">
                {grp.label && (
                  <tr role="row" className="bg-card"><td role="cell" colSpan={9} data-cell="full" className="px-2 py-1.5">
                    <button type="button" aria-expanded={!shut} className="flex min-h-6 w-full items-center gap-2 text-left font-medium" onClick={() => setOpen({ ...open, [grp.label]: shut ? true : false })}>
                      <span aria-hidden="true" className={`inline-block transition-transform duration-fast ${shut ? '' : 'rotate-90'}`}><Icon name="chevron" className="size-3.5" /></span>{grp.label}
                      <span className="text-xs font-normal text-muted-foreground">{grp.rows.length} · {sold ? `${sold} sold out` : 'all in stock'}</span>
                    </button>
                  </td></tr>
                )}
                {!shut && grp.rows.map((c) => {
                  const k = keyOf(c)
                  const label = c.filter((_, i) => i !== g).join(' / ') || 'This product'
                  const rowErrs = FIELDS.filter((f) => err(k, f))
                  const cell = cells[k] ?? EMPTY_CELL
                  const sees = shopperSees(cell, now)
                  const i = rowId.get(k)
                  return (
                    <tr role="row" key={k} className="border-t border-border/60 [&>td]:px-2 [&>td]:py-1.5">
                      <td role="cell" data-cell="full" className="font-medium md:whitespace-nowrap md:font-normal">{label}{rowErrs.map((f) => <FieldError key={f} name={`v:${k}:${f}`} message={err(k, f)} />)}</td>
                      <td role="cell" data-label="Price, ₹">{input(k, 'price', `Price for ${c.join(' ')}`)}</td>
                      <td role="cell" data-label="M.R.P., ₹">{input(k, 'compareAt', `M.R.P. for ${c.join(' ')}`)}</td>
                      {costs ? <td role="cell" data-label="Your cost, ₹">{input(k, 'cost', `Your cost for ${c.join(' ')}`)}</td> : null}
                      <td role="cell" data-label="Stock">{input(k, 'stock', `Stock for ${c.join(' ')}`, true, 'w-16')}</td>
                      <td role="cell" data-cell="full" data-label="When it runs out" className="md:min-w-44">
                        <label htmlFor={`out-${i}`} className="sr-only">When {c.join(' ')} runs out</label>
                        <select id={`out-${i}`} value={cell.whenOut ?? 'stop'} onChange={(e) => onChange(k, { whenOut: e.target.value as WhenOut })} className="h-8 w-full rounded-md border border-input bg-card px-1.5 text-sm">
                          {WHEN_OUT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                        {cell.whenOut === 'preorder' && (
                          <div className="mt-1 flex gap-1">
                            <label className="sr-only" htmlFor={`ships-${i}`}>Ships by, for {c.join(' ')}</label>
                            <input id={`ships-${i}`} type="date" value={cell.shipsBy ?? ''} {...marks(k, 'shipsBy')} onChange={(e) => onChange(k, { shipsBy: e.target.value })} className="h-8 w-36 rounded-md border border-input bg-card px-1.5 text-xs aria-invalid:border-danger-text" />
                            <label className="sr-only" htmlFor={`cap-${i}`}>Most pre-orders, for {c.join(' ')}</label>
                            <input id={`cap-${i}`} inputMode="numeric" placeholder="No limit" title="Most pre-orders to take" value={cell.cap ?? ''} {...marks(k, 'cap')} onChange={(e) => onChange(k, { cap: e.target.value })} className="h-8 w-20 rounded-md border border-input bg-card px-1.5 font-mono text-xs aria-invalid:border-danger-text" />
                          </div>
                        )}
                        {cell.whenOut === 'made_to_order' && (
                          <div className="mt-1 flex items-center gap-1 text-xs">
                            <label className="sr-only" htmlFor={`lmin-${i}`}>Fewest days to make, for {c.join(' ')}</label>
                            <input id={`lmin-${i}`} inputMode="numeric" placeholder="7" value={cell.leadMin ?? ''} {...marks(k, 'lead')} onChange={(e) => onChange(k, { leadMin: e.target.value })} className="h-8 w-12 rounded-md border border-input bg-card px-1.5 font-mono aria-invalid:border-danger-text" />
                            <span aria-hidden="true">–</span>
                            <label className="sr-only" htmlFor={`lmax-${i}`}>Most days to make, for {c.join(' ')}</label>
                            <input id={`lmax-${i}`} inputMode="numeric" placeholder="10" value={cell.leadMax ?? ''} {...marks(k, 'lead')} onChange={(e) => onChange(k, { leadMax: e.target.value })} className="h-8 w-12 rounded-md border border-input bg-card px-1.5 font-mono aria-invalid:border-danger-text" />
                            <span className="text-muted-foreground">days</span>
                          </div>
                        )}
                      </td>
                      <td role="cell" data-label="Shoppers see" className={`whitespace-nowrap text-xs ${SEES_TONE[sees.kind]}`}>{sees.label}</td>
                      <td role="cell" data-label="SKU">{input(k, 'sku', `SKU for ${c.join(' ')}`, true, 'w-40', autoSku(c))}</td>
                      <td role="cell" data-label="Barcode">{input(k, 'gtin', `Barcode for ${c.join(' ')}`, true, 'w-36')}</td>
                    </tr>
                  )
                })}
              </tbody>
            )
          })}
        </table>
      </div>
    </div>
  )
}
