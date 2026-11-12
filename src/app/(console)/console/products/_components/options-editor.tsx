'use client'

import { useState } from 'react'
import { MAX_OPTIONS, type Option } from '@/domains/catalogue/variants'
import { Icon } from '@/components/icons/icon'
import { FieldError, fieldProps } from '@/components/ui/field-error'

const SUGGEST: Record<string, string[]> = {
  size: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  colour: ['Black', 'White', 'Indigo', 'Rust', 'Sage', 'Ivory'],
}

/** Clothing sizes in the order shoppers read them: a size added later goes to its place, not the end (PR·0). */
const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL']
const rank = (v: string) => SIZE_ORDER.indexOf(v.trim().toUpperCase())

/** Adds `adds` to `values` once each (case-blind, within the new ones too), each known size in its place. */
export function addInOrder(values: readonly string[], adds: readonly string[]): string[] {
  const out = [...values]
  for (const a of adds) {
    if (out.some((v) => v.toLowerCase() === a.toLowerCase())) continue
    const r = rank(a)
    const at = r < 0 || out.some((v) => rank(v) < 0) ? -1 : out.findIndex((v) => rank(v) > r)
    if (at < 0) out.push(a); else out.splice(at, 0, a)
  }
  return out
}

/** Options first (Shopify's model): a name, then its values as chips. Enter adds; × removes; a chip renames in place
 *  and `onRename` carries its prices, stock, SKU, swatch and photos to the new name (PR·0: a rename wiped them). */
export function OptionsEditor({ options, onChange, onRename, error }: { options: Option[]; onChange: (o: Option[]) => void
  onRename?: (option: number, from: string, to: string) => void; error?: string }) {
  const [drafts, setDrafts] = useState<string[]>(options.map(() => ''))
  const [editing, setEditing] = useState<{ i: number; k: number; text: string; error?: string } | null>(null)
  const set = (i: number, o: Option) => onChange(options.map((x, j) => (j === i ? o : x)))
  const addValues = (i: number, raw: string) => {
    const vals = raw.split(',').map((v) => v.trim().replace(/\s+/g, ' ')).filter(Boolean)
    if (!vals.length) return
    const o = options[i]!
    set(i, { ...o, values: addInOrder(o.values, vals) })
    setDrafts((d) => d.map((x, j) => (j === i ? '' : x)))
  }
  const commit = () => {
    if (!editing) return
    const o = options[editing.i]!, from = o.values[editing.k]!, to = editing.text.trim().replace(/\s+/g, ' ')
    if (!to || to === from) { setEditing(null); return }
    if (o.values.some((v, j) => j !== editing.k && v.toLowerCase() === to.toLowerCase())) { setEditing({ ...editing, error: `${to} is already here.` }); return }
    if (onRename) onRename(editing.i, from, to)
    else set(editing.i, { ...o, values: o.values.map((v, j) => (j === editing.k ? to : v)) })
    setEditing(null)
  }
  return (
    <div className="space-y-3">
      {options.map((o, i) => {
        const suggest = (SUGGEST[o.name.trim().toLowerCase().replace(/^color$/, 'colour')] ?? []).filter((s) => !o.values.some((v) => v.toLowerCase() === s.toLowerCase()))
        return (
          <div key={i} className="space-y-2 rounded-md border border-border p-3">
            <div className="flex items-center gap-2">
              <label htmlFor={`opt-${i}`} className="sr-only">Option name</label>
              <input id={`opt-${i}`} value={o.name} maxLength={30} placeholder="Size" onChange={(e) => set(i, { ...o, name: e.target.value })}
                {...fieldProps('options', error)} className="h-8 w-40 rounded-md border border-input bg-card px-2 text-sm font-medium aria-invalid:border-danger-text" />
              <span className="flex-1" />
              <button type="button" className="inline-flex min-h-6 items-center text-sm text-muted-foreground underline" onClick={() => { onChange(options.filter((_, j) => j !== i)); setDrafts((d) => d.filter((_, j) => j !== i)) }}>Remove {o.name || 'option'}</button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {o.values.map((v, k) => editing?.i === i && editing.k === k ? (
                <span key={v} className="inline-flex flex-col">
                  <label htmlFor={`ren-${i}-${k}`} className="sr-only">Rename {v}</label>
                  <input id={`ren-${i}-${k}`} autoFocus value={editing.text} maxLength={40} aria-invalid={!!editing.error}
                    onChange={(e) => setEditing({ ...editing, text: e.target.value, error: undefined })}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit() } if (e.key === 'Escape') setEditing(null) }}
                    onBlur={commit} className="h-7 w-28 rounded-full border border-foreground bg-card px-2.5 text-sm aria-invalid:border-danger-text" />
                  {editing.error && <span className="text-xs text-danger-text">{editing.error}</span>}
                </span>
              ) : (
                <span key={v} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-sm">
                  <button type="button" aria-label={`Rename ${v}`} className="min-h-6" onClick={() => setEditing({ i, k, text: v })}>{v}</button><button type="button" aria-label={`Remove ${v}`} className="inline-grid min-h-6 min-w-6 place-items-center text-muted-foreground hover:text-foreground" onClick={() => set(i, { ...o, values: o.values.filter((_, j) => j !== k) })}><Icon name="close" className="size-3.5" /></button>
                </span>
              ))}
              <label htmlFor={`val-${i}`} className="sr-only">Add a {o.name || 'value'}</label>
              <input id={`val-${i}`} value={drafts[i] ?? ''} placeholder={`Add ${o.name.toLowerCase() || 'value'} ↵`}
                onChange={(e) => setDrafts((d) => d.map((x, j) => (j === i ? e.target.value : x)))}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addValues(i, drafts[i] ?? '') } }}
                onBlur={() => addValues(i, drafts[i] ?? '')}
                className="h-7 w-36 rounded-full border border-dashed border-input bg-transparent px-2.5 text-sm" />
            </div>
            {suggest.length > 0 && (
              // Quick-add chips, 24 px each (rule 19): they were comma-separated words 16 px tall (stress test S4).
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">Add: {suggest.map((s) => (
                <button key={s} type="button" aria-label={`Add ${s}`} className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-full border border-dashed border-input px-2 text-foreground hover:bg-accent" onClick={() => set(i, { ...o, values: addInOrder(o.values, [s]) })}>{s}</button>
              ))}</p>
            )}
          </div>
        )
      })}
      {/* The save's mistake in the options (key "options"): every option's name is marked, focus lands on the first. */}
      <FieldError name="options" message={error} />
      {options.length < MAX_OPTIONS && (
        <div className="flex flex-wrap gap-2">
          {!options.some((o) => /^sizes?$/i.test(o.name)) && <button type="button" className="inline-flex min-h-6 items-center text-sm underline" onClick={() => { onChange([...options, { name: 'Size', values: ['S', 'M', 'L'] }]); setDrafts((d) => [...d, '']) }}>Add sizes</button>}
          {!options.some((o) => /^colou?rs?$/i.test(o.name)) && <button type="button" className="inline-flex min-h-6 items-center text-sm underline" onClick={() => { onChange([...options, { name: 'Colour', values: [] }]); setDrafts((d) => [...d, '']) }}>Add colours</button>}
          <button type="button" className="inline-flex min-h-6 items-center text-sm underline" onClick={() => { onChange([...options, { name: '', values: [] }]); setDrafts((d) => [...d, '']) }}>Add another option</button>
        </div>
      )}
    </div>
  )
}
