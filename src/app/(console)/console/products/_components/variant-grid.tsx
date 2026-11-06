'use client'

import { useState } from 'react'
import type { VariantInput } from '@/domains/catalogue/product-form'
import { combinations, groupOption, keyOf, type Option } from '@/domains/catalogue/variants'

export type Cell = Omit<VariantInput, 'values'>
export const EMPTY_CELL: Cell = { price: '', compareAt: '', cost: '', stock: '0', sku: '' }

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
  const [every, setEvery] = useState({ price: '', stock: '' })
  const collapse = combos.length > 12
  const fill = (field: 'price' | 'stock', value: string, rows: string[][]) => rows.forEach((c) => onChange(keyOf(c), { [field]: value }))
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
          <div className="flex gap-1.5"><input id="every-price" inputMode="decimal" value={every.price} onChange={(e) => setEvery({ ...every, price: e.target.value })} className="h-8 w-24 rounded-md border border-input bg-card px-2 font-mono text-sm" />
            <button type="button" className="h-8 rounded-md border border-border bg-card px-2.5 text-sm" disabled={!every.price} onClick={() => fill('price', every.price, combos)}>Apply to {combos.length}</button></div></div>
        <div className="space-y-1"><label htmlFor="every-stock" className="block text-xs font-medium">Set every stock</label>
          <div className="flex gap-1.5"><input id="every-stock" inputMode="numeric" value={every.stock} onChange={(e) => setEvery({ ...every, stock: e.target.value })} className="h-8 w-20 rounded-md border border-input bg-card px-2 font-mono text-sm" />
            <button type="button" className="h-8 rounded-md border border-border bg-card px-2.5 text-sm" disabled={!every.stock} onClick={() => fill('stock', every.stock, combos)}>Apply</button></div></div>
      </div>
      <div className="relative overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr className="[&>th]:px-2 [&>th]:py-2">
            <th>{options.map((o) => o.name).join(' / ') || 'Product'}</th><th>Price, ₹</th><th>Compare at, ₹</th><th>Your cost, ₹</th><th>Stock</th><th>SKU</th></tr></thead>
          {groups.map((grp) => {
            const shut = collapse && grp.label && !open[grp.label]
            const sold = grp.rows.filter((c) => (Number((cells[keyOf(c)] ?? EMPTY_CELL).stock) || 0) === 0).length
            return (
              <tbody key={grp.label || 'all'} className="border-t border-border">
                {grp.label && (
                  <tr className="bg-card"><td colSpan={6} className="px-2 py-1.5">
                    <button type="button" aria-expanded={!shut} className="flex w-full items-center gap-2 text-left font-medium" onClick={() => setOpen({ ...open, [grp.label]: shut ? true : false })}>
                      <span aria-hidden="true" className={`inline-block transition-transform duration-fast ${shut ? '' : 'rotate-90'}`}>›</span>{grp.label}
                      <span className="text-xs font-normal text-muted-foreground">{grp.rows.length} · {sold ? `${sold} sold out` : 'all in stock'}</span>
                    </button>
                  </td></tr>
                )}
                {!shut && grp.rows.map((c) => {
                  const k = keyOf(c)
                  const label = c.filter((_, i) => i !== g).join(' / ') || 'This product'
                  const rowErr = ['price', 'compareAt', 'cost', 'stock', 'sku'].map((f) => err(k, f)).find(Boolean)
                  return (
                    <tr key={k} className="border-t border-border/60 [&>td]:px-2 [&>td]:py-1.5">
                      <td className="whitespace-nowrap">{label}{rowErr && <span className="block text-xs text-danger-text">{rowErr}</span>}</td>
                      <td>{input(k, 'price', `Price for ${c.join(' ')}`)}</td>
                      <td>{input(k, 'compareAt', `Compare-at price for ${c.join(' ')}`)}</td>
                      <td>{input(k, 'cost', `Your cost for ${c.join(' ')}`)}</td>
                      <td>{input(k, 'stock', `Stock for ${c.join(' ')}`, true, 'w-16')}</td>
                      <td>{input(k, 'sku', `SKU for ${c.join(' ')}`, true, 'w-40', autoSku(c))}</td>
                    </tr>
                  )
                })}
              </tbody>
            )
          })}
        </table>
      </div>
      <p className="text-xs text-muted-foreground">An empty SKU is made for you when you save (shown in grey); type your own to replace it. Your cost is never shown to shoppers. It is how Frata will work out profit on each order. Leave it empty if you do not know it yet.</p>
    </div>
  )
}
