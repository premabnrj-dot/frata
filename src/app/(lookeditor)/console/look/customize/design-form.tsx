'use client'

import { useId, useState } from 'react'
import { Icon } from '@/components/icons/icon'
import type { Design, LeafBlock } from '@/domains/themes/blocks'
import { accordionItems, fillFor, fillableOf } from '@/domains/themes/design-tree'
import { MAX_TILES, type Fill, type SectionOf } from '@/domains/themes/sections'
import { Choice, Field, ImageField, LinkPicker, SourcePicker, Text, WhenIST } from './controls'
import { LoopField, type FormCtx } from './section-form'
import { FIELD_BOX } from '@/components/ui/field'

// Theme Studio TS0b: a design's form (board v2 "Fill one"). The fields the theme marks for the owner, in page order,
// each with the theme's label. A field whose theme words are an example shows them greyed as a placeholder, marked
// "Example", and says what to write: Publish waits for the owner's own words (readiness). Loaded only when a design is
// opened (next/dynamic: the customizer is over its script budget). Every change goes through `set` (an undo step).
// TS1b: a product grid's source, a featured piece, collections, a video (the section's one loop, over its poster
// photo) and a drop date: each the section's own controls, reused.

type Set = (s: SectionOf<'design'>) => void
const MAX_ITEMS = 12
const move = <T,>(xs: T[], i: number, by: -1 | 1) => { const j = i + by; if (j < 0 || j >= xs.length) return xs; const out = [...xs]; [out[i], out[j]] = [out[j]!, out[i]!]; return out }
const bodyText = (body: { text: string }[][]) => body.map((p) => p.map((r) => r.text).join('')).join('\n\n')
/** Paragraphs from what the owner typed (a blank line starts one; each holds up to 600 characters, the run's cap). */
const toBody = (t: string) => t.split(/\n{2,}/).filter((p) => p.trim()).slice(0, 12).map((p) => [{ text: p.slice(0, 600) }])

/** Words typed as they are, kept while the field is edited (a blank line being typed isn't eaten: impact review); the
 *  saved paragraphs follow. When the stored words change from elsewhere (Undo), the field takes them. */
const asSaved = (t: string) => bodyText(toBody(t))
const field = `${FIELD_BOX} w-full placeholder:italic placeholder:text-muted-foreground`
function useRaw(stored: string, save: (t: string) => void, norm: (t: string) => string = (t) => t): [string, (t: string) => void] {
  const [raw, setRaw] = useState(stored)
  if (norm(raw) !== stored && raw !== stored) { setRaw(stored); return [stored, (t) => { setRaw(t); save(t) }] }
  return [raw, (t) => { setRaw(t); save(t) }]
}

function Example({ label, value: stored, example, max, multiline, onChange }: { label: string; value: string; example: string; max: number; multiline?: boolean; onChange: (v: string) => void }) {
  const id = useId()
  const [value, set] = useRaw(stored, onChange, multiline ? asSaved : undefined)
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium">{label}{!value.trim() && <span className="rounded-full bg-warn px-2 py-0.5 text-xs font-medium text-warn-text">Example</span>}
        <span className="ml-auto font-mono text-xs font-normal text-muted-foreground">{value.length}/{max}</span></label>
      {multiline
        ? <textarea id={id} value={value} maxLength={max} rows={4} placeholder={example} onChange={(e) => set(e.target.value)} className={`${field} py-2`} />
        : <input id={id} value={value} maxLength={max} placeholder={example} onChange={(e) => set(e.target.value)} className={`${field} h-11 md:h-9`} />}
      {!value.trim() && <p className="text-xs text-warn-text">Write your own</p>}
    </div>
  )
}

/** Plain (not example) words of a text block: typed as they are, saved as paragraphs. */
function Words({ label, value: stored, onChange }: { label: string; value: string; onChange: (t: string) => void }) {
  const [value, set] = useRaw(stored, onChange, asSaved)
  return <Text label={`${label} (a blank line starts a new paragraph)`} value={value} max={2000} multiline onChange={set} />
}

function Questions({ b, items, set }: { b: Extract<LeafBlock, { kind: 'accordion' }>; items: { q: string; a: string }[]; set: (items: { q: string; a: string }[]) => void }) {
  const example = b.fill?.example === true
  const item = (i: number, v: Partial<{ q: string; a: string }>) => set(items.map((x, j) => (j === i ? { ...x, ...v } : x)))
  return (
    <div className="space-y-2">
      <p className="flex items-center text-sm font-medium">{b.fill!.label}<span className="ml-auto font-mono text-xs font-normal text-muted-foreground">{items.length}/{MAX_ITEMS}</span></p>
      <ol className="space-y-2">
        {items.map((x, i) => (
          <li key={i} className="space-y-2 rounded-xl border border-input p-2.5">
            <div className="flex items-center gap-1">
              <input aria-label={`Question ${i + 1}`} value={x.q} maxLength={80} onChange={(e) => item(i, { q: e.target.value })} className={`${field} h-11 md:h-9 flex-1`} />
              <button type="button" aria-label={`Move question ${i + 1} up`} disabled={i === 0} onClick={() => set(move(items, i, -1))} className="grid size-9 place-items-center rounded-md disabled:opacity-30"><Icon name="up" className="size-4" /></button>
              <button type="button" aria-label={`Move question ${i + 1} down`} disabled={i === items.length - 1} onClick={() => set(move(items, i, 1))} className="grid size-9 place-items-center rounded-md disabled:opacity-30"><Icon name="down" className="size-4" /></button>
              <button type="button" aria-label={`Remove question ${i + 1}`} onClick={() => set(items.filter((_, j) => j !== i))} className="grid size-9 place-items-center rounded-md"><Icon name="close" className="size-3.5" /></button>
            </div>
            <textarea aria-label={`Answer ${i + 1}`} value={x.a} maxLength={600} rows={3} placeholder={example ? b.items[i]?.a ?? '' : ''} onChange={(e) => item(i, { a: e.target.value })} className={`${field} py-2`} />
            {example && !x.a.trim() && <p className="text-xs text-warn-text">Write your own answer</p>}
          </li>
        ))}
      </ol>
      {items.length < MAX_ITEMS && <button type="button" onClick={() => set([...items, { q: '', a: '' }])} className="w-full rounded-xl border-[1.5px] border-dashed border-input px-3 py-2.5 text-sm font-medium hover:border-foreground">Add a question</button>}
    </div>
  )
}

export function DesignForm({ s, set, c, d }: { s: SectionOf<'design'>; set: Set; c: FormCtx; d: Design }) {
  const own = (b: LeafBlock): Fill | null => fillFor(s.fill, b)
  const put = (id: string, f: Fill) => set({ ...s, fill: { ...s.fill, [id]: f } })
  return (<>
    {c.labels && <Text label="Label above the heading" value={s.label} max={24} onChange={(label) => set({ ...s, label })} />}
    {fillableOf(d).map((b) => {
      const f = own(b), label = b.fill!.label, example = b.fill?.example === true
      switch (b.kind) {
        case 'heading': {
          const v = f?.kind === 'heading' ? f.text : example ? '' : b.text
          return example
            ? <Example key={b.id} label={label} value={v} example={b.text} max={60} onChange={(text) => put(b.id, { kind: 'heading', text })} />
            : <Text key={b.id} label={label} value={v} max={60} onChange={(text) => put(b.id, { kind: 'heading', text })} />
        }
        case 'text': {
          const v = f?.kind === 'text' ? bodyText(f.body) : example ? '' : bodyText(b.body)
          return example
            ? <Example key={b.id} label={label} value={v} example={bodyText(b.body)} max={2000} multiline onChange={(t) => put(b.id, { kind: 'text', body: toBody(t) })} />
            : <Words key={b.id} label={label} value={v} onChange={(t) => put(b.id, { kind: 'text', body: toBody(t) })} />
        }
        case 'image':
          return <ImageField key={b.id} label={label} value={f?.kind === 'image' ? f.image : null} tenantId={c.tenantId} library={c.photos} suggest={[d.name, c.shopName]} onChange={(image) => put(b.id, { kind: 'image', image })} />
        case 'button': {
          const v = f?.kind === 'button' ? f : { kind: 'button' as const, label: b.label, link: b.link }
          return (
            <div key={b.id} className="space-y-2">
              <Text label={`${label}: words`} value={v.label} max={24} onChange={(l) => put(b.id, { ...v, label: l })} />
              <LinkPicker label={`${label}: goes to`} value={v.link} targets={c.targets} optional={false} onChange={(link) => put(b.id, { ...v, link: link ?? b.link })} />
            </div>
          )
        }
        case 'accordion': {
          return <Questions key={b.id} b={b} items={accordionItems(b, f)} set={(next) => put(b.id, { kind: 'accordion', items: next })} />
        }
        case 'product_grid':
          return <SourcePicker key={b.id} label={label} value={f?.kind === 'product_grid' ? f.source : b.source} collections={c.collections} onChange={(source) => put(b.id, { kind: 'product_grid', source })} />
        case 'featured_product': {
          const v = f?.kind === 'featured_product' ? f.handle : ''
          return <Field key={b.id} label={label}>{(id) => (
            <select id={id} value={v} onChange={(e) => { if (e.target.value) put(b.id, { kind: 'featured_product', handle: e.target.value }) }} className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm">
              {!v && <option value="">Pick a piece</option>}
              {c.products.map((p) => <option key={p.handle} value={p.handle}>{p.title}</option>)}
            </select>)}</Field>
        }
        case 'collection_tiles': {
          const v = f?.kind === 'collection_tiles' ? f : { kind: 'collection_tiles' as const, mode: b.mode, handles: [] as string[] }
          const toggle = (h: string) => put(b.id, { ...v, handles: v.handles.includes(h) ? v.handles.filter((x) => x !== h) : [...v.handles, h].slice(0, MAX_TILES) })
          return (
            <div key={b.id} className="space-y-2">
              <Choice label={label} value={v.mode} onChange={(mode) => put(b.id, { ...v, mode })} options={[{ value: 'auto', label: 'Automatic' }, { value: 'picked', label: 'I’ll pick' }]} />
              {v.mode === 'picked' && <fieldset className="space-y-1"><legend className="mb-1 text-sm font-medium">In this order ({v.handles.length} / {MAX_TILES})</legend>
                {c.collections.map((x) => { const on = v.handles.includes(x.handle); return <label key={x.handle} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={on} disabled={!on && v.handles.length >= MAX_TILES} onChange={() => toggle(x.handle)} />{x.title}</label> })}
                {!c.collections.length && <p className="text-sm text-muted-foreground">No collections yet.</p>}</fieldset>}
            </div>
          )
        }
        case 'video': {
          const poster = f?.kind === 'video' ? f.poster : null
          const canLoop = !!c.video?.sections.includes('design')
          return (
            <div key={b.id} className="space-y-3">
              {canLoop && <LoopField value={s.video} c={c} onChange={(video) => { if (video) set({ ...s, video }); else { const { video: _drop, ...rest } = s; set(rest as SectionOf<'design'>) } }} />}
              <ImageField label={canLoop ? `${label}: photo before it plays` : label} value={poster} tenantId={c.tenantId} library={c.photos} suggest={[d.name, c.shopName]} onChange={(p) => put(b.id, { kind: 'video', poster: p })} />
            </div>
          )
        }
        case 'date': {
          const v = f?.kind === 'date' ? f.at : null
          return <WhenIST key={b.id} label={`${label} (India time)`} value={v} onChange={(at) => put(b.id, { kind: 'date', at })} />
        }
        default: return b satisfies never
      }
    })}
  </>)
}
