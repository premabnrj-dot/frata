'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import type { Attribute } from '@/domains/catalogue/taxonomy'
import { categoryDetails, findCategories } from '../actions'

export type PickedCategory = { id: string; name: string; path: string; attributes: Attribute[] }
export type CollectionChip = { id: string; title: string; kind: 'manual' | 'auto'; in: boolean }

/** Category (from the standard list), collections and tags. */
export function OrganiseCard({ category, onCategory, collections, picked, onPicked, tags, onTags }: {
  category: PickedCategory | null; onCategory: (c: PickedCategory | null) => void
  collections: CollectionChip[]; picked: string[]; onPicked: (ids: string[]) => void
  tags: string[]; onTags: (t: string[]) => void
}) {
  const [tag, setTag] = useState('')
  const manual = collections.filter((c) => c.kind === 'manual')
  const auto = collections.filter((c) => c.kind === 'auto' && c.in)
  const addTag = () => { const t = tag.trim().replace(/\s+/g, ' ').slice(0, 40); if (t && !tags.includes(t) && tags.length < 20) onTags([...tags, t]); setTag('') }
  return (
    <section aria-labelledby="org-h" className="space-y-4 rounded-md border border-border bg-card p-4">
      <h2 id="org-h" className="font-semibold">Organise</h2>
      <CategoryPicker value={category} onChange={onCategory} />
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Collections</p>
        {manual.length === 0 && auto.length === 0 && <p className="text-xs text-muted-foreground">None yet. <Link href="/console/collections/new" className="underline">Make a collection</Link> to group products for your menus.</p>}
        {manual.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {manual.map((c) => {
              const on = picked.includes(c.id)
              return <button key={c.id} type="button" aria-pressed={on} onClick={() => onPicked(on ? picked.filter((x) => x !== c.id) : [...picked, c.id])}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors duration-fast ${on ? 'border-ring bg-accent font-medium' : 'border-border text-muted-foreground hover:bg-accent'}`}>{on ? '✓ ' : '+ '}{c.title}</button>
            })}
          </div>
        )}
        {auto.length > 0 && <p className="text-xs text-muted-foreground">Also in, by their rules: {auto.map((c) => c.title).join(', ')}.</p>}
      </div>
      <div className="space-y-1.5">
        <label htmlFor="tag" className="block text-sm font-medium">Tags <span className="font-normal text-muted-foreground">(optional, for your own sorting)</span></label>
        {tags.length > 0 && <ul className="flex flex-wrap gap-1.5">{tags.map((t) => <li key={t} className="flex items-center gap-1 rounded-sm bg-muted px-2 py-0.5 text-xs">{t}<button type="button" aria-label={`Remove tag ${t}`} onClick={() => onTags(tags.filter((x) => x !== t))} className="inline-grid min-h-6 min-w-6 place-items-center text-muted-foreground hover:text-foreground">×</button></li>)}</ul>}
        <input id="tag" value={tag} maxLength={40} placeholder="Diwali 2026, then Enter" onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag() } }} onBlur={addTag}
          className="h-10 md:h-9 w-full rounded-md border border-input bg-card px-3 text-sm" />
      </div>
    </section>
  )
}

/** A search box over the standard categories (searched on the server), as a combobox. */
export function CategoryPicker({ value, onChange, label = 'Category', bare = false }: { value: PickedCategory | null; onChange: (c: PickedCategory | null) => void; label?: string; bare?: boolean }) {
  const id = useId()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<{ id: string; name: string; path: string }[]>([])
  const [active, setActive] = useState(0)
  const [busy, setBusy] = useState(false)
  const seq = useRef(0)
  useEffect(() => {
    if (!open) return
    const n = ++seq.current
    const t = setTimeout(async () => { const r = await findCategories(q); if (n === seq.current) { setList(r); setActive(0) } }, 150)
    return () => clearTimeout(t)
  }, [q, open])
  const choose = async (c: { id: string }) => {
    setBusy(true)
    const d = await categoryDetails(c.id)
    setBusy(false); setOpen(false); setQ('')
    if (d) onChange(d)
  }
  const crumbs = (path: string) => path.split(' > ').slice(-3, -1).join(' › ')
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className={bare ? 'sr-only' : 'block text-sm font-medium'}>{label}</label>
      {value && !open ? (
        <div className="flex items-start justify-between gap-2 rounded-md border border-border p-2 text-sm">
          <span className="min-w-0"><span className="font-medium">{value.name}</span><span className="block truncate text-xs text-muted-foreground" title={value.path}>{crumbs(value.path)}</span></span>
          <button type="button" className="shrink-0 text-xs underline" onClick={() => setOpen(true)}>Change</button>
        </div>
      ) : (
        <div className="relative">
          <input id={id} role="combobox" aria-expanded={open && list.length > 0} aria-controls={`${id}-list`} aria-autocomplete="list" autoComplete="off"
            aria-activedescendant={open && list[active] ? `${id}-${active}` : undefined}
            value={q} placeholder="Kurta, sari, lehenga…" onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true) }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, list.length - 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
              else if (e.key === 'Enter' && list[active]) { e.preventDefault(); void choose(list[active]!) }
              else if (e.key === 'Escape') { setOpen(false) }
            }}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            className="h-10 md:h-9 w-full rounded-md border border-input bg-card px-3 text-sm" />
          {open && list.length > 0 && (
            <ul id={`${id}-list`} role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border border-border bg-card py-1 shadow-md">
              {list.map((c, i) => (
                <li key={c.id} id={`${id}-${i}`} role="option" aria-selected={i === active} onMouseDown={(e) => { e.preventDefault(); void choose(c) }} onMouseEnter={() => setActive(i)}
                  className={`cursor-pointer px-3 py-1.5 text-sm ${i === active ? 'bg-accent' : ''}`}>
                  {c.name}<span className="block truncate text-xs text-muted-foreground">{crumbs(c.path)}</span>
                </li>
              ))}
            </ul>
          )}
          {busy && <p className="text-xs text-muted-foreground">Loading its details…</p>}
        </div>
      )}
      {!bare && <p className="text-xs text-muted-foreground">From the standard list Google and Meta read. It decides which details are asked for below.</p>}
      {value && open && <button type="button" className="text-xs underline" onClick={() => setOpen(false)}>Keep {value.name}</button>}
    </div>
  )
}
