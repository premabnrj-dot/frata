'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { chartFromText, inches, type Chart } from '@/domains/catalogue/size-charts'
import { createType, saveSizeChart } from '../type-actions'
import { Icon } from '@/components/icons/icon'

export type TypeRow = { id: string; name: string; sizeChart: Chart; uses: number }

/** The product's type and its size chart. The chart belongs to the type: edit it once, every product of the type follows. */
export function SizeChartPanel({ types, typeId, onType }: { types: TypeRow[]; typeId: string | null; onType: (id: string | null) => void }) {
  const router = useRouter()
  const type = types.find((t) => t.id === typeId) ?? null
  const [unit, setUnit] = useState<'cm' | 'in'>('cm')
  // While editing, a cell is the text typed ("23." survives the keystroke; PR·0: 23.5 became 235); numbers on Save.
  type Draft = Omit<Chart, 'rows'> & { rows: { size: string; values: string[] }[] }
  const [edit, setEdit] = useState<Draft | null>(null)
  const toDraft = (c: Chart): Draft => ({ ...c, rows: c.rows.map((r) => ({ size: r.size, values: c.columns.map((_, i) => r.values[i] == null ? '' : String(r.values[i])) })) })
  // A refused create or save is an error toast (§ Feedback 1); what was typed stays.
  const toast = useToast()
  const [pending, start] = useTransition()
  const [newName, setNewName] = useState<string | null>(null)
  const [copy, setCopy] = useState(false)

  const show = (v: number | null) => (v === null ? '—' : unit === 'cm' ? String(v) : inches(v))
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label htmlFor="type" className="block text-sm font-medium">Product type</label>
          <select id="type" value={typeId ?? ''} onChange={(e) => { setEdit(null); onType(e.target.value || null) }} className="h-10 md:h-9 rounded-md border border-input bg-card px-2 text-sm">
            <option value="">No type</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        {newName === null
          ? <button type="button" className="h-9 text-sm underline" onClick={() => setNewName('')}>New type</button>
          : <form className="flex flex-wrap items-end gap-1.5" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await createType(newName, copy ? typeId : null); if (!r.ok) return toast.error(r.error); setNewName(null); setCopy(false); router.refresh(); onType(r.id) }) }}>
              <input aria-label="New type name" autoFocus value={newName} placeholder="Saree" onChange={(e) => setNewName(e.target.value)} className="h-10 md:h-9 w-36 rounded-md border border-input bg-card px-2 text-sm" />
              {type && type.sizeChart.rows.length > 0 && <label className="inline-flex min-h-6 items-center gap-1.5 text-sm"><input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} />Copy the {type.name} chart</label>}
              <Button type="submit" variant="secondary" disabled={pending || !newName.trim()}>Create</Button>
              <button type="button" className="inline-flex min-h-6 items-center text-sm underline" onClick={() => setNewName(null)}>Cancel</button>
            </form>}
      </div>
      {type && !edit && (
        <>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Shared by <b className="font-mono text-foreground">{type.uses}</b> product{type.uses === 1 ? '' : 's'}. Edit once and all follow.</span>
            <div role="group" aria-label="Units" className="flex overflow-hidden rounded-md border border-border text-xs">
              {(['cm', 'in'] as const).map((u) => <button key={u} type="button" aria-pressed={unit === u} onClick={() => setUnit(u)} className="px-2 py-1 aria-pressed:bg-primary aria-pressed:text-primary-foreground">{u === 'cm' ? 'cm' : 'inches'}</button>)}
            </div>
          </div>
          {type.sizeChart.rows.length ? (
            <div className="relative overflow-x-auto rounded-md border border-border">
              <table className="w-full table-fixed text-sm"><thead className="bg-muted/50 text-left text-xs text-muted-foreground"><tr className="[&>th]:px-1.5 [&>th]:py-1.5 [&>th]:[overflow-wrap:anywhere] md:[&>th]:px-2"><th>Size</th>{type.sizeChart.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>{type.sizeChart.rows.map((r) => <tr key={r.size} className="border-t border-border [&>td]:px-1.5 [&>td]:py-1.5 md:[&>td]:px-2"><td className="font-medium">{r.size}</td>{r.values.map((v, i) => <td key={i} className="font-mono">{show(v)}</td>)}</tr>)}</tbody>
              </table>
            </div>
          ) : <p className="text-sm text-muted-foreground">This type has no size chart.</p>}
          {type.sizeChart.howToMeasure && <p className="text-xs text-muted-foreground">{type.sizeChart.howToMeasure}</p>}
          <button type="button" className="inline-flex min-h-6 items-center text-sm underline" onClick={() => setEdit(toDraft(type.sizeChart))}>Edit the {type.name} chart</button>
        </>
      )}
      {type && edit && (
        <div data-own-save className="space-y-2 rounded-md border border-border p-3">
          <p className="text-sm">Editing the chart for every <b>{type.name}</b> ({type.uses} product{type.uses === 1 ? '' : 's'}). In cm.</p>
          <div className="relative overflow-x-auto"><table className="text-sm"><thead><tr className="[&>th]:px-1 [&>th]:py-1">
            <th className="text-left text-xs text-muted-foreground">Size</th>
            {edit.columns.map((c, i) => <th key={i}><span className="inline-flex items-center"><input aria-label={`Column ${i + 1} name`} value={c} onChange={(e) => setEdit({ ...edit, columns: edit.columns.map((x, j) => (j === i ? e.target.value : x)) })} className="h-7 w-20 rounded border border-input px-1 text-xs" />
              <button type="button" aria-label={`Remove ${c || `column ${i + 1}`}`} className="inline-grid min-h-6 min-w-6 place-items-center text-muted-foreground hover:text-foreground" onClick={() => setEdit({ ...edit, columns: edit.columns.filter((_, j) => j !== i), rows: edit.rows.map((r) => ({ ...r, values: r.values.filter((_, j) => j !== i) })) })}><Icon name="close" className="size-3.5" /></button></span></th>)}
            <th><button type="button" className="inline-flex min-h-6 items-center text-xs underline" onClick={() => setEdit({ ...edit, columns: [...edit.columns, ''], rows: edit.rows.map((r) => ({ ...r, values: [...r.values, ''] })) })}>+ column</button></th></tr></thead>
            <tbody>{edit.rows.map((r, ri) => (
              <tr key={ri} className="[&>td]:px-1 [&>td]:py-0.5">
                <td><input aria-label={`Row ${ri + 1} size`} value={r.size} onChange={(e) => setEdit({ ...edit, rows: edit.rows.map((x, j) => (j === ri ? { ...x, size: e.target.value } : x)) })} className="h-7 w-16 rounded border border-input px-1 text-xs" /></td>
                {edit.columns.map((_, ci) => <td key={ci}><input aria-label={`${r.size} ${edit.columns[ci]}`} inputMode="decimal" maxLength={6} value={r.values[ci] ?? ''} onChange={(e) => {
                  const v = e.target.value.replace(',', '.')
                  setEdit({ ...edit, rows: edit.rows.map((x, j) => (j === ri ? { ...x, values: x.values.map((y, k) => (k === ci ? v : y)) } : x)) })
                }} className="h-7 w-20 rounded border border-input px-1 font-mono text-xs" /></td>)}
                <td><button type="button" aria-label={`Remove ${r.size}`} className="inline-grid min-h-6 min-w-6 place-items-center text-xs text-muted-foreground" onClick={() => setEdit({ ...edit, rows: edit.rows.filter((_, j) => j !== ri) })}><Icon name="close" className="size-3.5" /></button></td>
              </tr>
            ))}</tbody></table></div>
          <button type="button" className="inline-flex min-h-6 items-center text-xs underline" onClick={() => setEdit({ ...edit, rows: [...edit.rows, { size: '', values: edit.columns.map(() => '') }] })}>+ size</button>
          <label htmlFor="how" className="block text-xs font-medium">How to measure</label>
          <textarea id="how" rows={2} value={edit.howToMeasure} onChange={(e) => setEdit({ ...edit, howToMeasure: e.target.value })} className="w-full rounded-md border border-input px-2 py-1 text-sm" />
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setEdit(null)} disabled={pending}>Keep the chart as it was</Button>
            <Button type="button" disabled={pending} onClick={() => start(async () => { const c = chartFromText(edit); if (typeof c === 'string') return toast.error(c); const r = await saveSizeChart(type.id, c); if (!r.ok) return toast.error(r.error); setEdit(null); router.refresh() })}>
              {pending ? 'Saving…' : `Save for all ${type.name}`}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
