'use client'

import { useState } from 'react'
import { SectionLibrary } from './section-library'
import { SECTION_NAMES, type SectionInstance, type SectionKey } from '@/domains/themes/sections'
import { Icon } from '@/components/icons/icon'

// The Sections tab (mockup "Customizer"): the Home's sections in order. Each row moves up or down (buttons: drag is
// not the only way), hides or shows, and opens its form; Header and Footer are always on. "Add a section" opens
// picture cards by kind (mockup "Add a section"). Every change is one undo step.

const summary = (s: SectionInstance): string => {
  switch (s.key) {
    case 'hero': return s.layout === 'text' ? 'Words only' : s.image ? 'With a photo' : 'Needs a photo'
    case 'products': return s.source.kind === 'newest' ? `New in · ${s.count}` : s.source.kind === 'best_sellers' ? `By delivered orders · ${s.source.days} days` : s.source.kind === 'collection' ? `A collection · ${s.count}` : s.source.kind === 'under_price' ? `Under a price · ${s.count}` : s.source.kind === 'back_in_stock' ? `Back in stock · ${s.count}` : `On sale · ${s.count}`
    case 'collection_tiles': return s.mode === 'auto' ? `Automatic · ${s.count}` : `${s.handles.length} picked`
    case 'price_tiles': return `${s.bands.length} tiles`
    case 'promises': return `${s.show.length} promises`
    case 'image_text': return s.heading || 'Image with text'
    case 'drop_teaser': return s.heading
    case 'rich_text': return s.heading || 'Text'
    case 'logos': return `${s.images.length} logos`
    case 'shop_the_look': return `${s.pieces.length} of 4 pieces`
  }
}

/** A new section with good defaults (written for the shop, never lorem ipsum). */
export function blank(key: SectionKey, id: string, now: Date): SectionInstance {
  switch (key) {
    case 'hero': return { id, key, hidden: false, scheme: 'paper', layout: 'text', heading: { from: 'shopName' }, text: { from: 'tagline' }, image: null, button: null, position: 'bottom_left', height: 'tall', mask: 'none' }
    case 'collection_tiles': return { id, key, hidden: false, scheme: 'paper', heading: '', mode: 'auto', handles: [], count: 6, shape: 'portrait' }
    case 'products': return { id, key, hidden: false, scheme: 'paper', heading: 'Best sellers', source: { kind: 'best_sellers', days: 90 }, count: 8, viewAll: true, layout: 'grid' }
    case 'price_tiles': return { id, key, hidden: false, scheme: 'paper', heading: 'Shop by budget', bands: [{ minPaise: null, maxPaise: 99900 }, { minPaise: null, maxPaise: 199900 }] }
    case 'promises': return { id, key, hidden: false, scheme: 'paper', show: ['cod', 'returns', 'dispatch'] }
    case 'image_text': return { id, key, hidden: false, scheme: 'paper', image: null, heading: 'Our story', text: '', button: null, side: 'left' }
    case 'drop_teaser': return { id, key, hidden: false, scheme: 'ink', heading: 'New collection', at: new Date(now.getTime() + 7 * 86_400_000 + 5.5 * 3_600_000).toISOString().slice(0, 16) + ':00+05:30', image: null }
    case 'rich_text': return { id, key, hidden: false, scheme: 'paper', heading: '', body: [], align: 'left' }
    case 'logos': return { id, key, hidden: false, scheme: 'paper', heading: 'As seen in', images: [] }
    case 'shop_the_look': return { id, key, hidden: false, scheme: 'paper', image: null, heading: 'Shop the look', pieces: [] }
  }
}


export function SectionsPanel({ home, selected, allowed, made = [], themeName, onSelect, onChange, issues, now }: {
  home: SectionInstance[]; selected: string | null; allowed: SectionKey[]; now: Date
  /** Sections made for this theme (shown first in the library); its name for "Fits <theme>". */
  made?: SectionKey[]; themeName: string
  onSelect: (id: string | null) => void; onChange: (home: SectionInstance[], selectId?: string) => void
  issues: Map<string, string>
}) {
  const [adding, setAdding] = useState(false)
  const move = (i: number, d: -1 | 1) => { const h = [...home]; const j = i + d; if (j < 0 || j >= h.length) return; [h[i], h[j]] = [h[j]!, h[i]!]; onChange(h) }
  const count = (k: SectionKey) => home.filter((s) => s.key === k).length
  const add = (k: SectionKey) => {
    const id = `${k.replace('_', '-')}-${crypto.randomUUID().slice(0, 8)}`
    const at = selected ? home.findIndex((s) => s.id === selected) + 1 : home.length
    const h = [...home]; h.splice(at, 0, blank(k, id, now)); onChange(h, id); setAdding(false)
  }
  const afterName = selected ? home.find((s) => s.id === selected) : null
  return (
    <div className="space-y-3">
      <ol className="space-y-1 text-sm">
        <li className="flex items-center gap-2 rounded-md px-2 py-2 text-muted-foreground"><span className="flex-1">Header</span><span className="text-xs">Always on</span></li>
        {home.map((s, i) => (
          <li key={s.id} className={`flex items-center gap-1 rounded-md px-1 ${s.id === selected ? 'bg-muted shadow-[inset_3px_0_0_var(--color-foreground)]' : ''}`}>
            <button type="button" onClick={() => onSelect(s.id)} className={`min-h-11 flex-1 px-1 text-left ${s.hidden ? 'text-muted-foreground' : ''}`} aria-current={s.id === selected ? 'true' : undefined}>
              <span className="block font-medium">{SECTION_NAMES[s.key]}{issues.has(s.id) && <span className="ml-2 text-xs font-normal text-warn-text">needs you</span>}</span>
              <span className="block text-xs text-muted-foreground">{s.hidden ? 'Hidden' : summary(s)}</span>
            </button>
            <button type="button" aria-label={`Move ${SECTION_NAMES[s.key]} up`} disabled={i === 0} onClick={() => move(i, -1)} className="grid size-9 place-items-center rounded-md disabled:opacity-30"><Icon name="up" className="size-4" /></button>
            <button type="button" aria-label={`Move ${SECTION_NAMES[s.key]} down`} disabled={i === home.length - 1} onClick={() => move(i, 1)} className="grid size-9 place-items-center rounded-md disabled:opacity-30"><Icon name="down" className="size-4" /></button>
            <button type="button" aria-label={`${s.hidden ? 'Show' : 'Hide'} ${SECTION_NAMES[s.key]}`} aria-pressed={!s.hidden} onClick={() => onChange(home.map((x) => (x.id === s.id ? { ...x, hidden: !x.hidden } : x)))} className="grid size-9 place-items-center rounded-md"><Icon name={s.hidden ? 'eyeOff' : 'eye'} className="size-4" /></button>
          </li>
        ))}
        <li className="flex items-center gap-2 rounded-md px-2 py-2 text-muted-foreground"><span className="flex-1">Footer</span><span className="text-xs">Always on</span></li>
      </ol>
      <button type="button" onClick={() => setAdding(true)} disabled={home.length >= 20} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-input text-sm font-medium transition-colors duration-fast hover:border-foreground hover:bg-muted"><Icon name="search" className="size-4" />Add a section</button>
      <p className="text-xs text-muted-foreground">Policies and contact always show in the footer.</p>

      <SectionLibrary open={adding} onClose={() => setAdding(false)} onAdd={add} allowed={allowed} made={made} themeName={themeName} count={count} after={afterName ? SECTION_NAMES[afterName.key] : null} />
    </div>
  )
}
