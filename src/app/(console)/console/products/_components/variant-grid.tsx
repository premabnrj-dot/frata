'use client'

import { useState } from 'react'
import type { VariantInput } from '@/domains/catalogue/product-form'
import { availability, type WhenOut } from '@/domains/catalogue/availability'
import { combinations, groupOption, keyOf, type Option } from '@/domains/catalogue/variants'
import { button } from '@/components/ui/button'

export type Cell = Omit<VariantInput, 'values'>
export const EMPTY_CELL: Cell = { price: '', compareAt: '', cost: '', stock: '0', sku: '', whenOut: 'stop', shipsBy: '', leadMin: '', leadMax: '', cap: '' }

/** What shoppers see for one cell right now: derived, never typed (availability.ts). */
export function shopperSees(c: Cell, now = new Date()) {
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
export function VariantGrid({ options, cells, onChange, errors, autoSku }: {
  options: Option[]
  cells: Record<string, Cell>
  onChange: (key: string, patch: Partial<Cell>) => void
  errors: Record<string, string>
  /** The SKU a save will make for an empty cell, shown as its placeholder. */
  autoSku: (values: string[]) => string
}) {
  const combos = combinations(options)
  const g = groupOption(options)
  const groups = g < 0 ? [{ label: '', rows: combos }] : options[g]!.values.map((v) => ({ label: v, rows: combos.filter((c) => c[g] === v) }))
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [every, setEvery] = useState({ price: '', stock: '', whenOut: '' as WhenOut | '' })
  const collapse = combos.length > 12
  const fill = (field: 'price' | 'stock' | 'whenOut', value: string, rows: string[][]) => rows.forEach((c) => onChange(keyOf(c), { [field]: value }))
  const err = (k: string, f: string) => errors[`v:${k}:${f}`]

  const rowId = new Map(combos.map((c, i) => [keyOf(c), i]))
  const input = (k: string, f: keyof Cell, label: string, mono = true, w = 'w-24', placeholder?: string) => (
    <div>
      <label htmlFor={`${f}-${rowId.get(k)}`} className="sr-only">{label}</label>
      <input id={`${f}-${rowId.get(k)}`} value={(cells[k] ?? EMPTY_CELL)[f]} inputMode={f === 'sku' ? undefined : 'decimal'} aria-invalid={!!err(k, f) || undefined}
        title={err(k, f)} placeholder={placeholder} onChange={(e) => onChange(k, { [f]: e.target.value })}
        className={`h-8 ${w} rounded-md border border-input bg-card px-2 text-sm ${mono ? 'font-mono' : ''} aria-invalid:border-danger-text aria-invalid:bg-danger`} />
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 rounded-md bg-muted/60 p-3">
        <div className="space-y-1"><label htmlFor="every-price" className="block text-xs font-medium">Set every price, ₹</label>
          <div className="flex gap-1.5"><input id="every-price" inputMode="decimal" value={every.price} onChange={(e) => setEvery({ ...every, price: e.target.value })} className="h-10 md:h-9 w-24 rounded-md border border-input bg-card px-2 font-mono text-sm" />
            <button type="button" className={button({ variant: 'secondary' })} disabled={!every.price} onClick={() => fill('price', every.price, combos)}>Apply to {combos.length}</button></div></div>
        <div className="space-y-1"><label htmlFor="every-stock" className="block text-xs font-medium">Set every stock</label>
          <div className="flex gap-1.5"><input id="every-stock" inputMode="numeric" value={every.stock} onChange={(e) => setEvery({ ...every, stock: e.target.value })} className="h-10 md:h-9 w-20 rounded-md border border-input bg-card px-2 font-mono text-sm" />
            <button type="button" className={button({ variant: 'secondary' })} disabled={!every.stock} onClick={() => fill('stock', every.stock, combos)}>Apply</button></div></div>
        <div className="space-y-1"><label htmlFor="every-out" className="block text-xs font-medium">When any runs out</label>
          <div className="flex gap-1.5"><select id="every-out" value={every.whenOut} onChange={(e) => setEvery({ ...every, whenOut: e.target.value as WhenOut })} className="h-10 md:h-9 rounded-md border border-input bg-card px-2 text-sm">
            <option value="">Choose…</option>{WHEN_OUT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <button type="button" className={button({ variant: 'secondary' })} disabled={!every.whenOut} onClick={() => fill('whenOut', every.whenOut, combos)}>Apply</button></div></div>
      </div>
      <div className="relative overflow-x-auto rounded-md border border-border">
        {/* On a phone each size and colour becomes a card of labelled fields (data-rows="form", rule 15). */}
        <table data-rows="form" role="table" aria-label="Sizes, colours and stock" className="w-full text-sm">
          <thead role="rowgroup" className="bg-muted/50 text-left text-xs text-muted-foreground"><tr role="row" className="[&>th]:px-2 [&>th]:py-2">
            <th role="columnheader">{options.map((o) => o.name).join(' / ') || 'Product'}</th><th role="columnheader">Price, ₹</th><th role="columnheader">Compare at, ₹</th><th role="columnheader">Your cost, ₹</th><th role="columnheader">Stock</th><th role="columnheader">When it runs out</th><th role="columnheader">Shoppers see</th><th role="columnheader">SKU</th></tr></thead>
          {groups.map((grp) => {
            const shut = collapse && grp.label && !open[grp.label]
            const sold = grp.rows.filter((c) => !shopperSees(cells[keyOf(c)] ?? EMPTY_CELL).canBuy).length
            return (
              <tbody role="rowgroup" key={grp.label || 'all'} className="border-t border-border">
                {grp.label && (
                  <tr role="row" className="bg-card"><td role="cell" colSpan={8} data-cell="full" className="px-2 py-1.5">
                    <button type="button" aria-expanded={!shut} className="flex min-h-6 w-full items-center gap-2 text-left font-medium" onClick={() => setOpen({ ...open, [grp.label]: shut ? true : false })}>
                      <span aria-hidden="true" className={`inline-block transition-transform duration-fast ${shut ? '' : 'rotate-90'}`}>›</span>{grp.label}
                      <span className="text-xs font-normal text-muted-foreground">{grp.rows.length} · {sold ? `${sold} sold out` : 'all in stock'}</span>
                    </button>
                  </td></tr>
                )}
                {!shut && grp.rows.map((c) => {
                  const k = keyOf(c)
                  const label = c.filter((_, i) => i !== g).join(' / ') || 'This product'
                  const rowErr = ['price', 'compareAt', 'cost', 'stock', 'sku', 'shipsBy', 'cap', 'lead'].map((f) => err(k, f)).find(Boolean)
                  const cell = cells[k] ?? EMPTY_CELL
                  const sees = shopperSees(cell)
                  const i = rowId.get(k)
                  return (
                    <tr role="row" key={k} className="border-t border-border/60 [&>td]:px-2 [&>td]:py-1.5">
                      <td role="cell" data-cell="full" className="font-medium md:whitespace-nowrap md:font-normal">{label}{rowErr && <span className="block text-xs text-danger-text">{rowErr}</span>}</td>
                      <td role="cell" data-label="Price, ₹">{input(k, 'price', `Price for ${c.join(' ')}`)}</td>
                      <td role="cell" data-label="Compare at, ₹">{input(k, 'compareAt', `Compare-at price for ${c.join(' ')}`)}</td>
                      <td role="cell" data-label="Your cost, ₹">{input(k, 'cost', `Your cost for ${c.join(' ')}`)}</td>
                      <td role="cell" data-label="Stock">{input(k, 'stock', `Stock for ${c.join(' ')}`, true, 'w-16')}</td>
                      <td role="cell" data-cell="full" data-label="When it runs out" className="md:min-w-44">
                        <label htmlFor={`out-${i}`} className="sr-only">When {c.join(' ')} runs out</label>
                        <select id={`out-${i}`} value={cell.whenOut ?? 'stop'} onChange={(e) => onChange(k, { whenOut: e.target.value as WhenOut })} className="h-8 w-full rounded-md border border-input bg-card px-1.5 text-sm">
                          {WHEN_OUT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                        {cell.whenOut === 'preorder' && (
                          <div className="mt-1 flex gap-1">
                            <label className="sr-only" htmlFor={`ships-${i}`}>Ships by, for {c.join(' ')}</label>
                            <input id={`ships-${i}`} type="date" value={cell.shipsBy ?? ''} aria-invalid={!!err(k, 'shipsBy') || undefined} onChange={(e) => onChange(k, { shipsBy: e.target.value })} className="h-8 w-36 rounded-md border border-input bg-card px-1.5 text-xs aria-invalid:border-danger-text" />
                            <label className="sr-only" htmlFor={`cap-${i}`}>Most pre-orders, for {c.join(' ')}</label>
                            <input id={`cap-${i}`} inputMode="numeric" placeholder="No limit" title="Most pre-orders to take" value={cell.cap ?? ''} aria-invalid={!!err(k, 'cap') || undefined} onChange={(e) => onChange(k, { cap: e.target.value })} className="h-8 w-20 rounded-md border border-input bg-card px-1.5 font-mono text-xs aria-invalid:border-danger-text" />
                          </div>
                        )}
                        {cell.whenOut === 'made_to_order' && (
                          <div className="mt-1 flex items-center gap-1 text-xs">
                            <label className="sr-only" htmlFor={`lmin-${i}`}>Fewest days to make, for {c.join(' ')}</label>
                            <input id={`lmin-${i}`} inputMode="numeric" placeholder="7" value={cell.leadMin ?? ''} aria-invalid={!!err(k, 'lead') || undefined} onChange={(e) => onChange(k, { leadMin: e.target.value })} className="h-8 w-12 rounded-md border border-input bg-card px-1.5 font-mono aria-invalid:border-danger-text" />
                            <span aria-hidden="true">–</span>
                            <label className="sr-only" htmlFor={`lmax-${i}`}>Most days to make, for {c.join(' ')}</label>
                            <input id={`lmax-${i}`} inputMode="numeric" placeholder="10" value={cell.leadMax ?? ''} aria-invalid={!!err(k, 'lead') || undefined} onChange={(e) => onChange(k, { leadMax: e.target.value })} className="h-8 w-12 rounded-md border border-input bg-card px-1.5 font-mono aria-invalid:border-danger-text" />
                            <span className="text-muted-foreground">days</span>
                          </div>
                        )}
                      </td>
                      <td role="cell" data-label="Shoppers see" className={`whitespace-nowrap text-xs ${SEES_TONE[sees.kind]}`}>{sees.label}</td>
                      <td role="cell" data-label="SKU">{input(k, 'sku', `SKU for ${c.join(' ')}`, true, 'w-40', autoSku(c))}</td>
                    </tr>
                  )
                })}
              </tbody>
            )
          })}
        </table>
      </div>
      <p className="text-xs text-muted-foreground">When it runs out applies once stock reaches 0: stop selling (sold out, still shown), take pre-orders with a ship-by date, or make to order with the days it takes. Shoppers see the result; you never type it.</p>
      <p className="text-xs text-muted-foreground">An empty SKU is made for you when you save (shown in grey); type your own to replace it. Your cost is never shown to shoppers. It is how Frata will work out profit on each order. Leave it empty if you do not know it yet.</p>
    </div>
  )
}
