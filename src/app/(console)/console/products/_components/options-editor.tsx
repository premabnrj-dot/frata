'use client'

import { optionKind } from '@/domains/catalogue/option-kind'
import { useState } from 'react'
import { MAX_OPTIONS, type Option } from '@/domains/catalogue/variants'
import { Icon } from '@/components/icons/icon'
import { isSizeOption } from '@/domains/storefront/picker'
import { FieldError, fieldProps } from '@/components/ui/field-error'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { moved, useReorder } from '@/components/ui/sortable'

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
  // Removing an option with values takes its rows (prices, stock, SKUs) with it: asked first (products PR·3).
  const [removing, setRemoving] = useState<number | null>(null)
  const remove = (i: number) => { onChange(options.filter((_, j) => j !== i)); setDrafts((d) => d.filter((_, j) => j !== i)); setRemoving(null) }
  const rows = (i: number) => options.reduce((n, o, j) => n * (j === i ? Math.max(1, o.values.length) : Math.max(1, o.values.length)), 1)
  /** Moves a value (the order the shop's buttons, the table and the size chart follow): useReorder says it and keeps
   *  focus on it; dragging by its handle does the same with a finger or a mouse. */
  const moveTo = (i: number, from: number, to: number) => { const o = options[i]!; set(i, { ...o, values: moved(o.values, from, to) }) }
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
          <OptionRow key={i} i={i} o={o} error={error} onName={(name) => set(i, { ...o, name })} onRemoveOption={() => (o.values.length ? setRemoving(i) : remove(i))}
            onMove={(from, to) => moveTo(i, from, to)} onRemoveValue={(k) => set(i, { ...o, values: o.values.filter((_, j) => j !== k) })}
            editing={editing?.i === i ? editing : null} onEdit={(k) => setEditing({ i, k, text: o.values[k]! })}
            onEditing={(text) => editing && setEditing({ ...editing, text, error: undefined })} onCommit={commit} onCancel={() => setEditing(null)}
            draft={drafts[i] ?? ''} onDraft={(text) => setDrafts((d) => d.map((x, j) => (j === i ? text : x)))} onAdd={() => addValues(i, drafts[i] ?? '')}>
            {suggest.length > 0 && (
              // Quick-add chips, 24 px each (rule 19): they were comma-separated words 16 px tall (stress test S4).
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">Add: {suggest.map((s) => (
                <button key={s} type="button" aria-label={`Add ${s}`} className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-full border border-dashed border-input px-2 text-foreground hover:bg-accent" onClick={() => set(i, { ...o, values: addInOrder(o.values, [s]) })}>{s}</button>
              ))}</p>
            )}
          </OptionRow>
        )
      })}
      <Dialog open={removing !== null} onClose={() => setRemoving(null)}
        title={removing !== null ? `Remove ${options[removing]?.name || 'this option'} and its ${rows(removing)} row${rows(removing) === 1 ? '' : 's'}?` : ''}
        description={removing !== null ? <>Their prices, stock and SKUs go too when you save.</> : undefined}
        actions={<><Button variant="secondary" data-autofocus onClick={() => setRemoving(null)}>Keep it</Button><Button variant="destructive" onClick={() => removing !== null && remove(removing)}>{`Remove ${options[removing ?? 0]?.name || 'option'}`}</Button></>} />
      {/* The save's mistake in the options (key "options"): every option's name is marked, focus lands on the first. */}
      <FieldError name="options" message={error} />
      {options.length < MAX_OPTIONS && (
        <div className="flex flex-wrap gap-2">
          {!options.some((o) => isSizeOption(o.name)) && <button type="button" className="inline-flex min-h-6 items-center text-sm underline" onClick={() => { onChange([...options, { name: 'Size', values: ['S', 'M', 'L'] }]); setDrafts((d) => [...d, '']) }}>Add sizes</button>}
          {!options.some((o) => optionKind(o.name) === 'colour') && <button type="button" className="inline-flex min-h-6 items-center text-sm underline" onClick={() => { onChange([...options, { name: 'Colour', values: [] }]); setDrafts((d) => [...d, '']) }}>Add colours</button>}
          <button type="button" className="inline-flex min-h-6 items-center text-sm underline" onClick={() => { onChange([...options, { name: '', values: [] }]); setDrafts((d) => [...d, '']) }}>Add another option</button>
        </div>
      )}
    </div>
  )
}

/** One option as drawn (Neel N2): its name at the left, then its values as chips — a handle to drag (or Alt+← →), the
 *  value to rename, × to remove — then "+ Add". */
function OptionRow({ i, o, error, onName, onRemoveOption, onMove, onRemoveValue, editing, onEdit, onEditing, onCommit, onCancel, draft, onDraft, onAdd, children }: {
  i: number; o: Option; error?: string; onName: (name: string) => void; onRemoveOption: () => void
  onMove: (from: number, to: number) => void; onRemoveValue: (k: number) => void
  editing: { k: number; text: string; error?: string } | null; onEdit: (k: number) => void; onEditing: (text: string) => void; onCommit: () => void; onCancel: () => void
  draft: string; onDraft: (text: string) => void; onAdd: () => void; children?: React.ReactNode
}) {
  const { itemProps } = useReorder(o.values.length, onMove)
  return (
    <div className="grid gap-x-4 gap-y-2 border-b border-line-soft pb-3 last:border-0 last:pb-0 sm:grid-cols-[7rem_minmax(0,1fr)]">
      <div className="flex items-start justify-between gap-2 sm:flex-col sm:justify-start">
        <input id={`opt-${i}`} aria-label="Option name" value={o.name} maxLength={30} placeholder="Size" onChange={(e) => onName(e.target.value)}
          {...fieldProps('options', error)} className="h-11 w-full rounded-md border border-transparent bg-transparent px-1.5 text-sm font-medium hover:border-input focus:border-input aria-invalid:border-danger-text md:h-8" />
        <button type="button" className="inline-flex min-h-11 items-center px-1.5 text-small text-muted-foreground underline md:min-h-6" onClick={onRemoveOption}>Remove</button>
      </div>
      <div className="min-w-0 space-y-2">
        <div data-sortable="" className="flex flex-wrap items-center gap-1.5">
          {o.values.map((v, k) => editing?.k === k ? (
            <span key={v} className="inline-flex flex-col">
              <input id={`ren-${i}-${k}`} aria-label={`Rename ${v}`} autoFocus value={editing.text} maxLength={40} aria-invalid={!!editing.error}
                onChange={(e) => onEditing(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onCommit() } if (e.key === 'Escape') onCancel() }}
                onBlur={onCommit} className="h-11 w-28 rounded-md border border-foreground bg-card px-2.5 text-sm aria-invalid:border-danger-text md:h-8" />
              {editing.error && <span className="text-small text-danger-text">{editing.error}</span>}
            </span>
          ) : (
            <span key={v} className="inline-flex h-11 items-center rounded-md border border-border bg-card pr-0.5 text-sm md:h-8">
              <span aria-hidden="true" className="grid h-full w-6 cursor-grab touch-none place-items-center text-muted-foreground" {...dragOnly(itemProps(k, v))}>⋮⋮</span>
              <button type="button" id={`chip-${i}-${k}`} aria-label={`Rename ${v}`} {...keysOnly(itemProps(k, v))} className="min-h-6 px-1" onClick={() => onEdit(k)}>{v}</button>
              <button type="button" aria-label={`Remove ${v}`} className="relative inline-grid size-6 place-items-center text-muted-foreground after:absolute after:-inset-2.5 hover:text-foreground md:after:inset-0" onClick={() => onRemoveValue(k)}><Icon name="close" className="size-3.5" /></button>
            </span>
          ))}
          <input id={`val-${i}`} aria-label={`Add a ${o.name || 'value'}`} value={draft} placeholder="+ Add"
            onChange={(e) => onDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); onAdd() } }}
            onBlur={onAdd} className="h-11 w-24 rounded-md border border-dashed border-input bg-transparent px-2.5 text-sm md:h-8" />
        </div>
        {children}
      </div>
    </div>
  )
}

type ItemProps = ReturnType<ReturnType<typeof useReorder>['itemProps']>
/** The handle takes the pointer (drag); the value's button takes the keys (Alt+← →) and is the item focus returns to. */
const dragOnly = ({ onPointerDown, onPointerMove, onPointerUp, onPointerCancel }: ItemProps) => ({ onPointerDown, onPointerMove, onPointerUp, onPointerCancel })
const keysOnly = ({ onKeyDown, ...rest }: ItemProps) => ({ onKeyDown, 'data-sort-item': rest['data-sort-item'], 'aria-keyshortcuts': rest['aria-keyshortcuts'] })
