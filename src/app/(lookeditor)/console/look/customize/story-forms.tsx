'use client'

import { Icon } from '@/components/icons/icon'
import { MAX_CARDS, type SectionOf } from '@/domains/themes/sections'
import { ImageField, LinkPicker, Text } from './controls'
import type { FormCtx } from './section-form'

// Signal 1.2's story sections (S2; owner: every option editable). Loaded only when one is opened (next/dynamic in
// section-form.tsx: the customizer is over its script budget). Every change goes through `set` (an undo step, autosaved).

type Set<S> = (s: S) => void
const move = <T,>(xs: T[], i: number, by: -1 | 1) => { const j = i + by; if (j < 0 || j >= xs.length) return xs; const out = [...xs]; [out[i], out[j]] = [out[j]!, out[i]!]; return out }

export function StoryFanForm({ s, set, c }: { s: SectionOf<'story_fan'>; set: Set<SectionOf<'story_fan'>>; c: FormCtx }) {
  const card = (i: number, v: Partial<SectionOf<'story_fan'>['cards'][number]>) => set({ ...s, cards: s.cards.map((x, j) => (j === i ? { ...x, ...v } : x)) })
  return (<>
    {c.labels && <Text label="Label above the heading" value={s.label} max={24} onChange={(label) => set({ ...s, label })} />}
    <Text label="Heading" value={s.heading} max={60} onChange={(heading) => set({ ...s, heading })} />
    <Text label="Line under it" value={s.text} max={160} onChange={(text) => set({ ...s, text })} />
    <ol className="space-y-3">
      {s.cards.map((x, i) => (
        <li key={i} className="space-y-2.5 rounded-xl border border-input p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Card {i + 1}</p>
            <span className="flex gap-1">
              <button type="button" aria-label={`Move card ${i + 1} up`} disabled={i === 0} onClick={() => set({ ...s, cards: move(s.cards, i, -1) })} className="grid size-9 place-items-center rounded-md disabled:opacity-30"><Icon name="up" className="size-4" /></button>
              <button type="button" aria-label={`Move card ${i + 1} down`} disabled={i === s.cards.length - 1} onClick={() => set({ ...s, cards: move(s.cards, i, 1) })} className="grid size-9 place-items-center rounded-md disabled:opacity-30"><Icon name="down" className="size-4" /></button>
              <button type="button" aria-label={`Remove card ${i + 1}`} onClick={() => set({ ...s, cards: s.cards.filter((_, j) => j !== i) })} className="grid size-9 place-items-center rounded-md"><Icon name="close" className="size-3.5" /></button>
            </span>
          </div>
          <ImageField label="Photo" value={x.image} tenantId={c.tenantId} library={c.photos} suggest={[x.title, s.heading]} onChange={(image) => card(i, { image })} />
          <Text label="Title (optional)" value={x.title} max={40} onChange={(title) => card(i, { title })} />
          <LinkPicker label="Opens (optional)" value={x.link} targets={c.targets} onChange={(link) => card(i, { link })} />
        </li>
      ))}
    </ol>
    {s.cards.length < MAX_CARDS && <button type="button" onClick={() => set({ ...s, cards: [...s.cards, { image: null, title: '', link: null }] })} className="w-full rounded-xl border-[1.5px] border-dashed border-input px-3 py-2.5 text-sm font-medium hover:border-foreground">Add a card ({s.cards.length} / {MAX_CARDS})</button>}
  </>)
}

export function StatementForm({ s, set, c }: { s: SectionOf<'statement'>; set: Set<SectionOf<'statement'>>; c: FormCtx }) {
  return (<>
    <ImageField label="Photo" value={s.image} tenantId={c.tenantId} library={c.photos} suggest={[s.wordmark, c.shopName]} onChange={(image) => set({ ...s, image })} />
    <Text label="Small line above" value={s.eyebrow} max={24} onChange={(eyebrow) => set({ ...s, eyebrow })} />
    <Text label="Handwritten line" value={s.wordmark} max={32} onChange={(wordmark) => set({ ...s, wordmark })} />
  </>)
}
