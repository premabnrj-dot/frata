'use client'

import { useId } from 'react'
import { NET_UNITS, NET_UNIT_WORDS, SHELF_MONTHS, type LabelInput } from '@/domains/catalogue/label'

// =============================================================================
// What the pack says (Beauty and wellness W1, domains/catalogue/label.ts): net quantity with its unit, best before,
// who made or packed it, ingredients, how to use. Shown to beauty and wellness shops; the first three are needed to
// go live (Legal Metrology r.6(10)), so they carry no "(optional)".
// =============================================================================

const field = 'w-full rounded-md border border-input bg-card px-3 text-sm aria-invalid:border-danger-text'

function Segmented<T extends string>({ label, value, options, onPick }: { label: string; value: T; options: readonly (readonly [T, string])[]; onPick: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-0.5 rounded-lg bg-muted p-0.5">
      {options.map(([v, words]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onPick(v)}
          className={`min-h-9 rounded-md px-3 text-sm font-medium ${value === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{words}</button>
      ))}
    </div>
  )
}

export function LabelPanel({ label, onChange, errors, maker }: {
  label: LabelInput; onChange: (l: LabelInput) => void; errors: Record<string, string>
  /** The shop's legal name and address, offered when the brand packs it itself. */
  maker: string
}) {
  const id = useId()
  const set = (patch: Partial<LabelInput>) => onChange({ ...label, ...patch })
  const err = (k: string) => errors[`label.${k}`] ? <p id={`${id}-${k}e`} className="text-sm text-danger-text">{errors[`label.${k}`]}</p> : null
  const inv = (k: string) => ({ 'aria-invalid': !!errors[`label.${k}`] || undefined, 'aria-describedby': errors[`label.${k}`] ? `${id}-${k}e` : undefined })
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label htmlFor={`${id}-net`} className="block text-sm font-medium">Net quantity</label>
        <div className="flex flex-wrap items-center gap-2">
          <input id={`${id}-net`} value={label.net} inputMode="decimal" placeholder="50" maxLength={12} onChange={(e) => set({ net: e.target.value })} {...inv('net')} className={`${field} h-10 w-28 md:h-9`} />
          <Segmented label="Unit" value={label.unit as (typeof NET_UNITS)[number]} options={NET_UNITS.map((u) => [u, NET_UNIT_WORDS[u]] as const)} onPick={(unit) => set({ unit })} />
        </div>
        {err('net')}
      </div>
      <div className="space-y-1">
        <span id={`${id}-shelf`} className="block text-sm font-medium">Best before</span>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="Best before, months from manufacture" value={label.shelf} options={SHELF_MONTHS.map((m) => [String(m), `${m} mo`] as const)} onPick={(shelf) => set({ shelf })} />
          <span className="text-sm text-muted-foreground">from manufacture</span>
        </div>
        {err('shelf')}
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={`${id}-maker`} className="block text-sm font-medium">Made or packed by</label>
          {maker && label.maker !== maker && <button type="button" onClick={() => set({ maker })} className="text-sm font-medium text-primary hover:underline">We pack it</button>}
        </div>
        <textarea id={`${id}-maker`} value={label.maker} rows={2} maxLength={300} placeholder="Name and full address, as on the pack" onChange={(e) => set({ maker: e.target.value })} {...inv('maker')} className={`${field} py-2`} />
        {err('maker')}
      </div>
      <div className="space-y-1">
        <label htmlFor={`${id}-ing`} className="block text-sm font-medium">Ingredients <span className="font-normal text-muted-foreground">(optional)</span></label>
        <textarea id={`${id}-ing`} value={label.ingredients} rows={3} maxLength={3000} placeholder="Aqua, Glycerin, Niacinamide…" onChange={(e) => set({ ingredients: e.target.value })} {...inv('ingredients')} className={`${field} py-2`} />
        {err('ingredients')}
      </div>
      <div className="space-y-1">
        <label htmlFor={`${id}-use`} className="block text-sm font-medium">How to use <span className="font-normal text-muted-foreground">(optional)</span></label>
        <textarea id={`${id}-use`} value={label.use} rows={2} maxLength={1000} onChange={(e) => set({ use: e.target.value })} {...inv('use')} className={`${field} py-2`} />
        {err('use')}
      </div>
    </div>
  )
}
