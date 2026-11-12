'use client'

import type { Attribute } from '@/domains/catalogue/taxonomy'
import { Icon } from '@/components/icons/icon'

/** The details the product's category asks for: chosen values as chips, the rest in a list to add from. */
export function DetailsPanel({ attributes, values, onChange }: { attributes: Attribute[]; values: Record<string, string[]>; onChange: (v: Record<string, string[]>) => void }) {
  if (!attributes.length) return <p className="text-sm text-muted-foreground">Pick a category (under Organise) and the details it asks for show here: fabric, neckline, occasion and more.</p>
  const set = (h: string, vals: string[]) => { const next = { ...values }; if (vals.length) next[h] = vals; else delete next[h]; onChange(next) }
  // Feed-required first, then the rest in the category's order.
  const sorted = [...attributes].sort((a, b) => Number(!!b.forFeeds) - Number(!!a.forFeeds))
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {sorted.map((a) => {
        const chosen = values[a.handle] ?? []
        const name = (id: string) => a.values.find((v) => v.id === id)?.name ?? id
        const rest = a.values.filter((v) => !chosen.includes(v.id))
        return (
          <div key={a.handle} className="min-w-0 space-y-1.5">
            <label htmlFor={`attr-${a.handle}`} className="block text-sm font-medium">{a.name}{a.forFeeds && <span className="ml-1.5 text-xs font-normal text-info-text">Google asks for this</span>}</label>
            {chosen.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {chosen.map((id) => <li key={id} className="flex items-center gap-1 rounded-sm bg-accent px-2 py-0.5 text-xs">{name(id)}<button type="button" aria-label={`Remove ${name(id)}`} onClick={() => set(a.handle, chosen.filter((x) => x !== id))} className="inline-grid min-h-6 min-w-6 place-items-center text-muted-foreground hover:text-foreground"><Icon name="close" className="size-4" /></button></li>)}
              </ul>
            )}
            <select id={`attr-${a.handle}`} value="" disabled={chosen.length >= 20} onChange={(e) => e.target.value && set(a.handle, [...chosen, e.target.value])} className="h-11 md:h-9 w-full rounded-md border border-input bg-card px-2 text-sm">
              <option value="">{chosen.length ? 'Add another…' : 'Choose…'}</option>
              {rest.map((v) => <option key={v.id} value={v.id}>{v.name}{v.frata ? ' ·' : ''}</option>)}
            </select>
          </div>
        )
      })}
    </div>
  )
}
