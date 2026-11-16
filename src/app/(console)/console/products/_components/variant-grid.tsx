'use client'

import { useEffect, useId, useState } from 'react'
import type { VariantInput } from '@/domains/catalogue/product-form'
import { availability } from '@/domains/catalogue/availability'
import { targetsOf, unpriced } from '@/domains/catalogue/common-price'
import { parseRupees } from '@/domains/money/rupees'
import { formatInr } from '@/lib/format'
import { paise } from '@/domains/money/paise'
import { combinations, groupOption, keyOf, type Option } from '@/domains/catalogue/variants'
import { useNow } from '@/components/time/now'
import { Icon } from '@/components/icons/icon'
import { FieldError, fieldProps } from '@/components/ui/field-error'
import { TabPanel, Tabs } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { BulkBar } from './bulk-bar'
import { ShopperChip } from './shopper-chip'

export type Cell = Omit<VariantInput, 'values'>
export const EMPTY_CELL: Cell = { price: '', compareAt: '', cost: '', stock: '0', sku: '', gtin: '', whenOut: 'stop', shipsBy: '', leadMin: '', leadMax: '', cap: '' }

/** What shoppers see for one cell right now: derived, never typed (availability.ts). */
export function shopperSees(c: Cell, now: Date) {
  const lead = Number(c.leadMin) || null
  return availability({ stock: Number(c.stock) || 0, whenOut: c.whenOut ?? 'stop', shipsBy: c.shipsBy || null, leadMinDays: lead, leadMaxDays: Number(c.leadMax) || lead, preorderCap: c.cap ? Number(c.cap) : null }, now)
}

type TabId = 'price' | 'sku'
const TABS = [{ id: 'price', label: 'Price and stock' }, { id: 'sku', label: 'SKU and barcode' }] as const

/**
 * Stock and prices (Neel N2, mockup § Stock and prices): two tabs over one table of every size × colour, grouped by
 * colour (folded past 12 rows; a group with a mistake stays open). Pick rows, then set their price or stock in the bar.
 * Shoppers see is a chip (derived) that opens the row's run-out choice. Your cost is the merchant's own (`costs`) and never
 * leaves the console; M.R.P. shows as a column only when a variant's differs from the product's.
 */
export function VariantGrid({ options, cells, onChange, errors, autoSku, costs }: {
  options: Option[]
  cells: Record<string, Cell>
  onChange: (key: string, patch: Partial<Cell>) => void
  errors: Record<string, string>
  /** The SKU a save will make for an empty cell, shown as its placeholder. */
  autoSku: (values: string[]) => string
  costs: boolean
}) {
  const now = useNow()
  const base = useId()
  const combos = combinations(options)
  const g = groupOption(options)
  const groups = g < 0 ? [{ label: '', rows: combos }] : options[g]!.values.map((v) => ({ label: v, rows: combos.filter((c) => c[g] === v) }))
  const [tab, setTab] = useState<TabId>('price')
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [chip, setChip] = useState<string | null>(null)
  // Past 12 rows, and always on a phone (as drawn: "Gulabi · 6 sizes · ₹2,490 · 32 in stock ›"), each colour folds to
  // its summary until opened.
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const m = window.matchMedia('(max-width: 767px)'); setPhone(m.matches)
    const on = () => setPhone(m.matches); m.addEventListener('change', on); return () => m.removeEventListener('change', on)
  }, [])
  const collapse = combos.length > 12 || phone
  const summary = (rows: string[][]) => {
    const cs = rows.map((c) => cells[keyOf(c)] ?? EMPTY_CELL)
    const priced = cs.filter((c) => !unpriced(c.price))
    if (!priced.length) return 'No price yet'
    const low = Math.min(...priced.map((c) => parseRupees(c.price)!))
    return `${formatInr(paise(low))} · ${cs.reduce((n, c) => n + (Number(c.stock) || 0), 0)} in stock`
  }
  const err = (k: string, f: string) => errors[`v:${k}:${f}`]
  // A save's mistake is shown where it is: the SKU tab for a SKU or barcode, the row's chip for its run-out fields.
  useEffect(() => {
    const ks = Object.keys(errors)
    if (ks.some((x) => /^v:.*:(sku|gtin)$/.test(x)) && !ks.some((x) => /^v:.*:(price|compareAt|cost|stock)$/.test(x))) setTab('sku')
    const run = ks.find((x) => /^v:.*:(shipsBy|cap|lead)$/.test(x))
    if (run) setChip(run.slice(2, run.lastIndexOf(':')))
  }, [errors])
  const all = combos.map(keyOf)
  // A size removed after it was picked leaves the pick (Set never writes to a row that is gone).
  useEffect(() => { setPicked((p) => { const live = new Set(all); const n = new Set([...p].filter((k) => live.has(k))); return n.size === p.size ? p : n }) }, [all.join('\u0001')]) // eslint-disable-line react-hooks/exhaustive-deps
  const rows = (f: 'compareAt') => combos.map((c) => ({ key: keyOf(c), text: (cells[keyOf(c)] ?? EMPTY_CELL)[f] ?? '' }))
  const ownMrp = targetsOf(rows('compareAt')).length < combos.length
  // Colour first, as drawn ("Gulabi · XS").
  const name = (c: string[]) => (g >= 0 ? [c[g]!, ...c.filter((_, i) => i !== g)] : c).join(' · ') || 'This product'
  const toggle = (ks: string[], on: boolean) => setPicked((p) => { const n = new Set(p); ks.forEach((k) => (on ? n.add(k) : n.delete(k))); return n })
  const pickedGroup = groups.find((x) => x.label && x.rows.length === picked.size && x.rows.every((c) => picked.has(keyOf(c))))
  const what = pickedGroup ? `${pickedGroup.label} · ${picked.size} ${options.filter((_, i) => i !== g).map((o) => o.name.toLowerCase())[0] ?? 'variant'}s` : `${picked.size} ${picked.size === 1 ? 'variant' : 'variants'}`
  const set = (v: { price: string; stock: string; emptyOnly: boolean }) => {
    const n = { price: 0, stock: 0 }
    for (const k of picked) {
      if (!all.includes(k)) continue
      const c = cells[k] ?? EMPTY_CELL
      const patch: Partial<Cell> = {}
      if (v.price && (!v.emptyOnly || unpriced(c.price))) { patch.price = v.price; n.price++ }
      if (v.stock && (!v.emptyOnly || !c.stock.trim() || c.stock.trim() === '0')) { patch.stock = v.stock; n.stock++ }
      if (Object.keys(patch).length) onChange(k, patch)
    }
    return n
  }
  const input = (k: string, f: keyof Cell, label: string, w: string, placeholder?: string) => (
    <>
      <input id={`${base}-${f}-${all.indexOf(k)}`} aria-label={label} value={(cells[k] ?? EMPTY_CELL)[f] ?? ''} placeholder={placeholder}
        inputMode={f === 'sku' ? undefined : f === 'gtin' || f === 'stock' ? 'numeric' : 'decimal'} {...fieldProps(`v:${k}:${f}`, err(k, f))}
        onChange={(e) => onChange(k, { [f]: e.target.value })}
        className={cn('h-11 rounded-md border border-input bg-card px-2 text-sm tabular-nums md:h-8 aria-invalid:border-danger-text', w, f === 'sku' || f === 'gtin' ? 'font-mono' : 'font-num')} />
      <FieldError name={`v:${k}:${f}`} message={err(k, f)} />
    </>
  )
  const head = (which: TabId, cols: React.ReactNode) => (
    <thead className="border-b border-border bg-sunk text-left text-small text-muted-foreground [&_th]:h-9 [&_th]:px-3 [&_th]:font-medium">
      <tr>
        <th className="w-10"><input id={`${base}-all-${which}`} type="checkbox" aria-label="Select every size and colour" checked={picked.size === all.length && all.length > 0}
          ref={(el) => { if (el) el.indeterminate = picked.size > 0 && picked.size < all.length }} onChange={(e) => toggle(all, e.target.checked)} /></th>
        <th className="whitespace-nowrap">Size and colour</th>{cols}
      </tr>
    </thead>
  )
  const table = (which: TabId) => (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table data-rows="form" aria-label={which === 'price' ? 'Price and stock' : 'SKU and barcode'} className="w-full text-sm">
        {which === 'price'
          ? head(which, <><th>Price, ₹</th>{ownMrp ? <th>M.R.P., ₹</th> : null}{costs ? <th>Your cost, ₹</th> : null}<th>Stock</th><th>Shoppers see</th></>)
          : head(which, <><th>SKU</th><th>Barcode</th></>)}
        {groups.map((grp) => {
          const shut = collapse && grp.label && !open[grp.label] && !grp.rows.some((c) => Object.keys(errors).some((x) => x.startsWith(`v:${keyOf(c)}:`)))
          return (
            <tbody key={grp.label || 'all'}>
              {grp.label && collapse ? (
                <tr className="border-b border-line-soft bg-side">
                  <td className="w-10 px-2"><label className="inline-flex size-6 items-center justify-center"><input type="checkbox" aria-label={`Select ${grp.label}`} checked={grp.rows.every((c) => picked.has(keyOf(c)))}
                    onChange={(e) => toggle(grp.rows.map(keyOf), e.target.checked)} /></label></td>
                  <td colSpan={which === 'price' ? 4 + (ownMrp ? 1 : 0) + (costs ? 1 : 0) : 3} data-cell="full" className="px-3 py-1.5">
                    {collapse ? (
                      <button type="button" aria-expanded={!shut} onClick={() => setOpen({ ...open, [grp.label]: !!shut })} className="flex min-h-11 w-full items-center gap-2 text-left font-medium md:min-h-6">
                        <span className="min-w-0 flex-1">{grp.label} · <span className="tabular-nums">{grp.rows.length}</span> {grp.rows.length === 1 ? 'size' : 'sizes'}
                          <span className="block text-small font-normal text-muted-foreground tabular-nums md:inline md:pl-2">{summary(grp.rows)}</span></span>
                        <Icon name="chevron" className={cn('size-3.5 shrink-0 transition-transform duration-fast', !shut && 'rotate-90')} />
                      </button>
                    ) : <span className="font-medium">{grp.label}</span>}
                  </td>
                </tr>
              ) : null}
              {!shut && grp.rows.map((c) => {
                const k = keyOf(c)
                const cell = cells[k] ?? EMPTY_CELL
                const on = picked.has(k)
                return (
                  <tr key={k} data-selected={on || undefined} className={cn('border-b border-line-soft last:border-0 [&>td]:px-3 [&>td]:py-1.5 md:[&>td]:h-12', on && 'bg-select')}>
                    <td className="w-10"><label className="inline-flex size-6 items-center justify-center"><input type="checkbox" className="size-5 md:size-auto" aria-label={`Select ${name(c)}`} checked={on} onChange={(e) => toggle([k], e.target.checked)} /></label></td>
                    <td data-cell="full" className="md:whitespace-nowrap">{name(c)}</td>
                    {which === 'price' ? <>
                      <td data-label="Price, ₹">{input(k, 'price', `Price for ${c.join(' ')}`, 'w-24')}</td>
                      {ownMrp ? <td data-label="M.R.P., ₹">{input(k, 'compareAt', `M.R.P. for ${c.join(' ')}`, 'w-24')}</td> : null}
                      {costs ? <td data-label="Your cost, ₹">{input(k, 'cost', `Your cost for ${c.join(' ')}`, 'w-24')}</td> : null}
                      <td data-label="Stock">{input(k, 'stock', `Stock for ${c.join(' ')}`, 'w-16')}</td>
                      <td data-label="Shoppers see">
                        <ShopperChip k={k} name={name(c)} cell={cell} sees={shopperSees(cell, now)} unpriced={unpriced(cell.price)} errors={errors}
                          onChange={(patch) => onChange(k, patch)} open={chip === k} onOpenChange={(o) => setChip(o ? k : chip === k ? null : chip)} />
                      </td>
                    </> : <>
                      <td data-label="SKU">{input(k, 'sku', `SKU for ${c.join(' ')}`, 'w-44', autoSku(c))}</td>
                      <td data-label="Barcode">{input(k, 'gtin', `Barcode for ${c.join(' ')}`, 'w-40')}</td>
                    </>}
                  </tr>
                )
              })}
            </tbody>
          )
        })}
      </table>
    </div>
  )
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs base={base} label="Stock and prices" tabs={TABS} value={tab} onChange={setTab} />
        {picked.size ? null : <span className="text-small text-muted-foreground">Select rows, then set</span>}
      </div>
      {picked.size ? <BulkBar what={what} count={picked.size} onSet={set} onClear={() => { setPicked(new Set()); requestAnimationFrame(() => document.getElementById(`${base}-all-${tab}`)?.focus()) }} /> : null}
      <TabPanel base={base} id="price" value={tab}>{table('price')}</TabPanel>
      <TabPanel base={base} id="sku" value={tab}>{table('sku')}</TabPanel>
    </div>
  )
}
