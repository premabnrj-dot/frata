'use client'

import { useState } from 'react'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { Name } from '@/components/data/name'
import { Money, Numeric } from '@/components/data/numeric'
import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { splitValues } from '@/domains/catalogue/import/cells'
import { FIELDS, type Field, type Mapping } from '@/domains/catalogue/import/fields'
import type { Checked } from '@/domains/catalogue/import/plan'
import type { Sheet } from '@/domains/catalogue/import/sheet'
import { parseRupees } from '@/domains/money/rupees'
import { paise } from '@/domains/money/paise'
import { Count, Counts } from './parts'

const SHOWN = 100
const MONEY: Field[] = ['price', 'sale', 'compareAt', 'cost']
const WOO_ONLY: Field[] = ['rowId', 'parent', 'kind']

/** One column's first value as it will be read: a price shown back in rupees, sizes counted, a cost marked as hers. */
function Sample({ field, cell }: { field: Field; cell: string }) {
  if (!cell) return null
  if (field === 'cost') return <>Only you see it</>
  if (MONEY.includes(field)) { const p = parseRupees(cell); return <span className="font-mono">{cell}{p !== null && <> → <Money paise={paise(p)} decimals /></>}</span> }
  if (field === 'size' || field === 'colour') { const n = splitValues(cell, field === 'size' ? 'size' : 'other').length; return <>{cell}{n > 1 && ` → ${n} ${field === 'size' ? 'sizes' : 'colours'}`}</> }
  return <span className="line-clamp-1 [overflow-wrap:anywhere]">{cell}</span>
}

/** Step 2 (mockup view 2 · Check): counts first, what to fix, how columns were matched, the first products as they will look. */
export function CheckStep({ sheet, mapping, checked, costs, cap, busy, onRemap, onFix, onKeep, onImport }: {
  sheet: Sheet; mapping: Mapping; checked: Checked; costs: boolean; cap: string | null; busy: boolean
  onRemap: (column: number, field: Field | null) => void; onFix: () => void; onKeep: () => void; onImport: () => void
}) {
  const [editing, setEditing] = useState(false)
  const shown = checked.problems
  const fresh = checked.products.filter((p) => p.state === 'new')
  const count = (s: Checked['products'][number]['state']) => checked.products.filter((p) => p.state === s).length
  const variants = fresh.reduce((t, p) => t + p.variants, 0)
  const first = (i: number) => sheet.rows.find((r) => r.cells[i])?.cells[i] ?? ''
  const matched = mapping.fields.map((f, i) => [f, i] as const).filter((x): x is readonly [Field, number] => x[0] !== null)
  const unmatched = mapping.headers.filter((h, i) => h && mapping.fields[i] === null)
  const choices = (Object.keys(FIELDS) as Field[]).filter((f) => (costs || f !== 'cost') && (mapping.source === 'woocommerce' || !WOO_ONLY.includes(f)))
  const n = fresh.length
  return (
    <>
      <Counts label="What this file does">
        <Count value={n} label={<>New products · <span className="font-mono tabular-nums">{variants.toLocaleString('en-IN')}</span> sizes and colours</>} />
        <Count value={count('in_shop')} label="Already in your shop" />
        <Count value={count('left_out')} label="Left out until fixed" bad />
      </Counts>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {shown.length > 0 && (
          <Section flush title={`${count('left_out')} to fix`} action={<Button variant="secondary" onClick={onFix}>Download rows to fix</Button>}>
            <DataTable label="Rows to fix">
              <DataTableHead><th className="text-right">Row</th><th>Column</th><th>What to fix</th></DataTableHead>
              <DataTableBody>
                {shown.slice(0, SHOWN).map((p, i) => (
                  <DataTableRow key={`${p.row}-${i}`}>
                    <Td cell="a" className="md:text-right"><Numeric>{p.row}</Numeric></Td>
                    <Td cell="b" className="md:text-left">{p.column}</Td>
                    <Td cell="e" className="[overflow-wrap:anywhere]">{p.message}</Td>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
            {shown.length > SHOWN && <p className="px-4 py-2 text-xs text-muted-foreground">Showing 1–{SHOWN} of {shown.length.toLocaleString('en-IN')} · every one is in the file</p>}
          </Section>
        )}
        <Section title="Columns" action={<Badge tone="ok">{matched.length} matched</Badge>} className={shown.length ? '' : 'lg:col-span-2'}>
          <dl className="grid text-sm">
            {(editing ? mapping.fields.map((fld, i) => [fld, i] as const) : matched).map(([f, i]) => (
              <div key={i} className="grid gap-x-3 gap-y-0.5 border-b border-border py-2 last:border-b-0 sm:grid-cols-[9rem_minmax(0,1fr)_minmax(0,1fr)] sm:items-center">
                {editing ? (
                  <>
                    <dt className="[overflow-wrap:anywhere]">&ldquo;{mapping.headers[i]}&rdquo;</dt>
                    <dd className="sm:col-span-2">
                      <select aria-label={`What “${mapping.headers[i]}” is`} value={f ?? ''} onChange={(e) => onRemap(i, (e.target.value || null) as Field | null)}
                        className="h-10 w-full min-w-0 rounded-md border border-input bg-card px-2 text-sm md:h-9">
                        <option value="">Not imported</option>
                        {choices.map((c) => <option key={c} value={c}>{FIELDS[c]}</option>)}
                      </select>
                    </dd>
                  </>
                ) : (
                  <>
                    <dt className="text-muted-foreground">{FIELDS[f!]}</dt>
                    <dd className="[overflow-wrap:anywhere]">&ldquo;{mapping.headers[i]}&rdquo;</dd>
                    <dd className="text-xs text-muted-foreground"><Sample field={f!} cell={first(i)} /></dd>
                  </>
                )}
              </div>
            ))}
            {!editing && unmatched.length > 0 && (
              <div className="grid gap-x-3 py-2 sm:grid-cols-[9rem_minmax(0,1fr)]">
                <dt className="text-muted-foreground">Not imported</dt>
                <dd className="[overflow-wrap:anywhere]">{unmatched.map((h) => `“${h}”`).join(', ')}</dd>
              </div>
            )}
          </dl>
          <Button variant="secondary" onClick={() => setEditing((e) => !e)} aria-expanded={editing}>{editing ? 'Done' : 'Change a match'}</Button>
        </Section>
      </div>
      <Section flush title="Preview" action={n > 0 ? <span className="text-xs text-muted-foreground">First {Math.min(3, n)} of {n.toLocaleString('en-IN')}</span> : undefined}>
        {n > 0 ? (
          <DataTable label="Preview">
            <DataTableHead><th>Product</th><th>Sizes · colours</th><th className="text-right">Price</th><th className="text-right">Stock</th><th>Photos</th></DataTableHead>
            <DataTableBody>
              {fresh.slice(0, 3).map((v) => {
                return (
                  <DataTableRow key={v.key}>
                    <Td cell="a"><Name>{v.title}</Name> {!/^[\x20-\x7e]*$/.test(v.title) && <span className="text-xs text-muted-foreground">/{v.handle}</span>}</Td>
                    <Td cell="c">{v.values || 'One size'}</Td>
                    <Td cell="b" className="text-right">{v.price !== null && <Money paise={paise(v.price)} />}</Td>
                    <Td cell="e" className="md:text-right"><Numeric>{v.stock}</Numeric><span className="md:hidden"> in stock</span></Td>
                    <Td cell="d"><Badge tone="warn">Needs photos</Badge></Td>
                  </DataTableRow>
                )
              })}
            </DataTableBody>
          </DataTable>
        ) : <p className="px-4 py-3 text-sm text-muted-foreground">Nothing new to import.</p>}
        <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-card px-4 py-2.5">
          {cap && <p role="alert" className="mr-auto text-sm text-danger-text">{cap}</p>}
          <Button variant="secondary" onClick={onKeep}>Keep my shop as it is</Button>
          {n > 0 && !cap && <Button onClick={onImport} disabled={busy}>{n === 1 ? 'Import 1 as a draft' : `Import ${n.toLocaleString('en-IN')} as drafts`}</Button>}
        </div>
      </Section>
    </>
  )
}
