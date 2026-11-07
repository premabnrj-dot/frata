'use client'

import { useState } from 'react'
import { MAX_OPTIONS, type Option } from '@/domains/catalogue/variants'

const SUGGEST: Record<string, string[]> = {
  size: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  colour: ['Black', 'White', 'Indigo', 'Rust', 'Sage', 'Ivory'],
}

/** Options first (Shopify's model): a name, then its values as chips. Enter adds; × removes. */
export function OptionsEditor({ options, onChange, error }: { options: Option[]; onChange: (o: Option[]) => void; error?: string }) {
  const [drafts, setDrafts] = useState<string[]>(options.map(() => ''))
  const set = (i: number, o: Option) => onChange(options.map((x, j) => (j === i ? o : x)))
  const addValues = (i: number, raw: string) => {
    const vals = raw.split(',').map((v) => v.trim()).filter(Boolean)
    if (!vals.length) return
    const o = options[i]!
    const have = new Set(o.values.map((v) => v.toLowerCase()))
    set(i, { ...o, values: [...o.values, ...vals.filter((v) => !have.has(v.toLowerCase()))] })
    setDrafts((d) => d.map((x, j) => (j === i ? '' : x)))
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
                className="h-8 w-40 rounded-md border border-input bg-card px-2 text-sm font-medium" />
              <span className="flex-1" />
              <button type="button" className="text-sm text-muted-foreground underline" onClick={() => { onChange(options.filter((_, j) => j !== i)); setDrafts((d) => d.filter((_, j) => j !== i)) }}>Remove {o.name || 'option'}</button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {o.values.map((v, k) => (
                <span key={v} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-sm">
                  {v}<button type="button" aria-label={`Remove ${v}`} className="inline-grid min-h-6 min-w-6 place-items-center text-muted-foreground hover:text-foreground" onClick={() => set(i, { ...o, values: o.values.filter((_, j) => j !== k) })}>×</button>
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
              <p className="text-xs text-muted-foreground">Add: {suggest.map((s, k) => (
                <button key={s} type="button" className="underline" onClick={() => set(i, { ...o, values: [...o.values, s] })}>{s}{k < suggest.length - 1 ? ',' : ''} </button>
              ))}</p>
            )}
          </div>
        )
      })}
      {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
      {options.length < MAX_OPTIONS && (
        <div className="flex flex-wrap gap-2">
          {!options.some((o) => /^sizes?$/i.test(o.name)) && <button type="button" className="text-sm underline" onClick={() => { onChange([...options, { name: 'Size', values: ['S', 'M', 'L'] }]); setDrafts((d) => [...d, '']) }}>Add sizes</button>}
          {!options.some((o) => /^colou?rs?$/i.test(o.name)) && <button type="button" className="text-sm underline" onClick={() => { onChange([...options, { name: 'Colour', values: [] }]); setDrafts((d) => [...d, '']) }}>Add colours</button>}
          <button type="button" className="text-sm underline" onClick={() => { onChange([...options, { name: '', values: [] }]); setDrafts((d) => [...d, '']) }}>Add another option</button>
        </div>
      )}
    </div>
  )
}
