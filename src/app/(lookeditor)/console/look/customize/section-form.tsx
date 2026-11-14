'use client'

import { MAX_LOOPS, MAX_TABS, type ProductLayout, type SectionScheme } from '@/domains/themes/sections'
import { useState } from 'react'
import { PROMISES, sectionName, type SectionInstance, type SectionOf, type VideoKey } from '@/domains/themes/sections'
import { Choice, Field, ImageField, LinkPicker, SourcePicker, Switch, Text, WhenIST, paiseToRupees, rupeesToPaise, type LibraryPhoto, type LinkTarget } from './controls'
import { Icon } from '@/components/icons/icon'
import { urlFor } from '@/domains/media/sizes'
import dynamic from 'next/dynamic'
import type { Design } from '@/domains/themes/blocks'

// Only a video section shows it: it loads when one is edited (feedback F1, the editor's budget).
const VideoField = dynamic(() => import('./video-field').then((m) => m.VideoField))

// Signal 1.2's story forms load only when one is opened (speed review: the customizer is over its script budget).
const StoryFanForm = dynamic(() => import('./story-forms').then((m) => m.StoryFanForm))
const StatementForm = dynamic(() => import('./story-forms').then((m) => m.StatementForm))
// Theme Studio TS0b: a design's form, likewise loaded only when a design is opened.
const DesignForm = dynamic(() => import('./design-form').then((m) => m.DesignForm))

// One section's settings (themes spec § Sections: every field, type and limit). The form edits a copy; every
// change goes through `set`, which the editor turns into an undo step and an autosave.

export type FormCtx = {
  tenantId: string
  targets: LinkTarget[]
  collections: { handle: string; title: string }[]
  schemes: { key: SectionScheme; name: string }[]
  masks: ('none' | 'arch')[]
  /** The products section's layouts this theme offers (Signal plan T1). */
  layouts: readonly ProductLayout[]
  /** Whether this theme shows section labels (theme Signal): then each section asks for its label. */
  labels: boolean
  promiseWords: Record<(typeof PROMISES)[number], { text: string; true: boolean }>
  /** The shop's product photos (each product's first, newest first): "From your products" in a photo field (Look v3). */
  photos: LibraryPhoto[]; shopName: string
  /** The shop's products, newest first (Shop the look picks from them). */
  products: { handle: string; title: string }[]
  /** V1: the sections this theme lets carry a loop, and whether video is switched on for shops (Mux is set up). */
  video?: { sections: readonly VideoKey[]; on: boolean }
  /** TS1b: the Home already plays MAX_LOOPS (a section without a loop offers none). */
  loopsFull?: boolean
  /** Signal 1.2 (S2): Image with text's Spotlight layout and the Hero's script line, where the theme offers them. */
  spotlight?: boolean; heroScript?: boolean
  /** TS0b: this theme version's designs, by id (a design's form and readiness read them). */
  designs?: Record<string, Design>
}

type Set<S> = (s: S) => void

/** A section's loop field, or the limit in words when the Home already plays MAX_LOOPS (owner 2026-11-11). */
export function LoopField({ value, c, onChange }: { value: { id: string } | undefined; c: FormCtx; onChange: (v: { id: string } | undefined) => void }) {
  if (!value && c.loopsFull) return <p className="text-sm text-muted-foreground">A Home plays at most {MAX_LOOPS} videos.</p>
  return <VideoField value={value} on={!!c.video?.on} onChange={onChange} />
}

/** A section with its loop set, or with no `video` key at all once removed (stored layers stay as before). */
function withVideo<S extends { video?: { id: string } }>(s: S, video: { id: string } | undefined): S {
  if (video) return { ...s, video }
  const { video: _drop, ...rest } = s
  return rest as S
}

function Bound({ label, value, max, shopField, onChange }: { label: string; value: { from: 'shopName' | 'tagline' } | { text: string } | undefined; max: number; shopField: 'shopName' | 'tagline'; onChange: (v: { from: 'shopName' | 'tagline' } | { text: string } | undefined) => void }) {
  const bound = !!value && 'from' in value
  return (
    <div className="space-y-2">
      <Switch label={shopField === 'shopName' ? `${label}: your shop’s name` : `${label}: your tagline`} on={bound} onChange={(on) => onChange(on ? { from: shopField } : { text: '' })} />
      {!bound && <Text label={label} value={value && 'text' in value ? value.text : ''} max={max} onChange={(text) => onChange({ text })} />}
    </div>
  )
}

function ButtonFields({ value, targets, onChange }: { value: { label: string; link: string } | null; targets: LinkTarget[]; onChange: (v: { label: string; link: string } | null) => void }) {
  return (
    <div className="space-y-2">
      <Switch label="A button" on={!!value} onChange={(on) => onChange(on ? { label: 'Shop now', link: '/products' } : null)} />
      {value && <>
        <Text label="Button words" value={value.label} max={24} onChange={(label) => onChange({ ...value, label })} />
        <LinkPicker label="Button goes to" value={value.link} targets={targets} optional={false} onChange={(link) => onChange({ ...value, link: link ?? '/products' })} />
      </>}
    </div>
  )
}

function Hero({ s, set, c }: { s: SectionOf<'hero'>; set: Set<SectionOf<'hero'>>; c: FormCtx }) {
  return (<>
    <Choice label="Layout" value={s.layout} onChange={(layout) => set({ ...s, layout })} options={[{ value: 'text', label: 'Words only' }, { value: 'image_text', label: 'Words on a photo' }, { value: 'split', label: 'Photo beside words' }, { value: 'image', label: 'Photo only' }]} />
    {c.heroScript && s.layout !== 'image' && <Text label="Handwritten line above (optional)" value={s.script ?? ''} max={32} onChange={(script) => { const { script: _old, ...rest } = s; set(script ? { ...rest, script } : rest) }} />}
    {s.layout !== 'text' && <ImageField label={s.video ? 'Photo (optional with a video)' : 'Photo'} value={s.image} tenantId={c.tenantId} library={c.photos} suggest={['text' in s.heading ? s.heading.text : '', c.shopName]} onChange={(image) => set({ ...s, image })} />}
    {s.layout !== 'text' && c.video?.sections.includes('hero') && <LoopField value={s.video} c={c} onChange={(video) => set(withVideo(s, video))} />}
    <Bound label="Heading" value={s.heading} max={60} shopField="shopName" onChange={(heading) => set({ ...s, heading: heading ?? { from: 'shopName' } })} />
    {s.layout !== 'image' && <Bound label="Line under it" value={s.text} max={160} shopField="tagline" onChange={(text) => set({ ...s, text })} />}
    {s.layout !== 'image' && <ButtonFields value={s.button} targets={c.targets} onChange={(button) => set({ ...s, button })} />}
    {s.layout === 'image_text' && <Choice label="Words sit" value={s.position} onChange={(position) => set({ ...s, position })} options={[{ value: 'bottom_left', label: 'Bottom left' }, { value: 'centre', label: 'Centre' }]} />}
    {s.layout !== 'text' && s.layout !== 'split' && <Choice label="Height" value={s.height} onChange={(height) => set({ ...s, height })} options={[{ value: 'short', label: 'Short' }, { value: 'tall', label: 'Tall' }]} />}
    {s.layout === 'split' && c.masks.includes('arch') && <Choice label="Photo shape" value={s.mask} onChange={(mask) => set({ ...s, mask })} options={[{ value: 'none', label: 'Rectangle' }, { value: 'arch', label: 'Arch' }]} />}
  </>)
}

function Tiles({ s, set, c }: { s: SectionOf<'collection_tiles'>; set: Set<SectionOf<'collection_tiles'>>; c: FormCtx }) {
  const toggle = (h: string) => set({ ...s, handles: s.handles.includes(h) ? s.handles.filter((x) => x !== h) : [...s.handles, h].slice(0, 8) })
  return (<>
    {c.labels && <Text label="Label above the heading" value={s.label} max={24} onChange={(label) => set({ ...s, label })} />}
    <Text label="Heading (optional)" value={s.heading} max={40} onChange={(heading) => set({ ...s, heading })} />
    <Choice label="Which collections" value={s.mode} onChange={(mode) => set({ ...s, mode })} options={[{ value: 'auto', label: 'Automatic' }, { value: 'picked', label: 'I’ll pick' }]} />
    {s.mode === 'auto'
      ? <Choice label="How many" value={s.count} onChange={(count) => set({ ...s, count })} options={[2, 3, 4, 6, 8].map((n) => ({ value: n, label: String(n) }))} />
      : <fieldset className="space-y-1"><legend className="mb-1 text-sm font-medium">Collections, in this order ({s.handles.length} / 8)</legend>
          {c.collections.map((x) => <label key={x.handle} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.handles.includes(x.handle)} onChange={() => toggle(x.handle)} />{x.title}</label>)}
          {!c.collections.length && <p className="text-sm text-muted-foreground">No collections yet.</p>}</fieldset>}
    <Choice label="Shape" value={s.shape} onChange={(shape) => set({ ...s, shape })} options={[{ value: 'portrait', label: 'Portrait' }, { value: 'square', label: 'Square' }, { value: 'circle', label: 'Circle' }]} />
  </>)
}

function Products({ s, set, c }: { s: SectionOf<'products'>; set: Set<SectionOf<'products'>>; c: FormCtx }) {
  const src = s.source
  return (<>
    <Text label="Heading" value={s.heading} max={40} onChange={(heading) => set({ ...s, heading })} />
    <SourcePicker value={src} collections={c.collections} onChange={(source) => set({ ...s, source })} />
    <Choice label="How many" value={s.count} onChange={(count) => set({ ...s, count })} options={[4, 8, 12, 24].map((n) => ({ value: n as 4 | 8 | 12 | 24, label: String(n) }))} />
    <Choice label="Layout" value={s.layout} onChange={(layout) => set({ ...s, layout })} options={([{ value: 'grid', label: 'Grid' }, { value: 'rail', label: 'Swipe row' }, { value: 'tabs', label: 'Tabs by collection' }] as const).filter((o) => c.layouts.includes(o.value))} />
    {s.layout === 'tabs' && <fieldset className="space-y-1"><legend className="text-sm font-medium">Tabs (up to {MAX_TABS})</legend>
      {c.collections.map((x) => { const on = s.tabs.includes(x.handle); return (
        <label key={x.handle} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={on} disabled={!on && s.tabs.length >= MAX_TABS} onChange={() => set({ ...s, tabs: on ? s.tabs.filter((h) => h !== x.handle) : [...s.tabs, x.handle] })} />{x.title}</label>
      ) })}
    </fieldset>}
    {c.labels && <Text label="Label above the heading" value={s.label} max={24} onChange={(label) => set({ ...s, label })} />}
    {(src.kind === 'newest' || src.kind === 'collection') && <Switch label="“See all” link" on={s.viewAll} onChange={(viewAll) => set({ ...s, viewAll })} />}
  </>)
}

function Prices({ s, set }: { s: SectionOf<'price_tiles'>; set: Set<SectionOf<'price_tiles'>> }) {
  const put = (i: number, b: SectionOf<'price_tiles'>['bands'][number]) => set({ ...s, bands: s.bands.map((x, j) => (j === i ? b : x)) })
  return (<>
    <Text label="Heading" value={s.heading} max={40} onChange={(heading) => set({ ...s, heading })} />
    {s.bands.map((b, i) => (
      <div key={i} className="flex flex-wrap items-end gap-2 text-sm">
        <Field label={`Tile ${i + 1}: from ₹`}>{(id) => <input id={id} inputMode="numeric" defaultValue={paiseToRupees(b.minPaise)} onBlur={(e) => put(i, { ...b, minPaise: rupeesToPaise(e.target.value) })} placeholder="any" className="h-10 w-24 rounded-md border border-input bg-card px-2 font-num" />}</Field>
        <Field label="to ₹">{(id) => <input id={id} inputMode="numeric" defaultValue={paiseToRupees(b.maxPaise)} onBlur={(e) => put(i, { ...b, maxPaise: rupeesToPaise(e.target.value) })} placeholder="any" className="h-10 w-24 rounded-md border border-input bg-card px-2 font-num" />}</Field>
        {s.bands.length > 1 && <button type="button" onClick={() => set({ ...s, bands: s.bands.filter((_, j) => j !== i) })} className="min-h-10 px-2 underline underline-offset-4">Remove</button>}
      </div>
    ))}
    {s.bands.length < 4 && <button type="button" onClick={() => set({ ...s, bands: [...s.bands, { minPaise: null, maxPaise: 299900 }] })} className="min-h-9 text-sm underline underline-offset-4">Add a tile</button>}
  </>)
}

function Promises({ s, set, c }: { s: SectionOf<'promises'>; set: Set<SectionOf<'promises'>>; c: FormCtx }) {
  const toggle = (k: (typeof PROMISES)[number]) => { const show = s.show.includes(k) ? s.show.filter((x) => x !== k) : [...s.show, k]; if (show.length) set({ ...s, show }) }
  return (
    <fieldset className="space-y-1.5"><legend className="mb-1 text-sm font-medium">Promises (the words come from your settings)</legend>
      {PROMISES.map((k) => <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.show.includes(k)} onChange={() => toggle(k)} />{c.promiseWords[k].text}{!c.promiseWords[k].true && <span className="text-muted-foreground">(not true today: hidden)</span>}</label>)}
    </fieldset>
  )
}

function ImageText({ s, set, c }: { s: SectionOf<'image_text'>; set: Set<SectionOf<'image_text'>>; c: FormCtx }) {
  return (<>
    {c.spotlight && <Choice label="Layout" value={s.layout ?? 'beside'} onChange={(v) => { const { layout: _old, ...rest } = s; set(v === 'spotlight' ? { ...rest, layout: 'spotlight' } : rest) }} options={[{ value: 'beside', label: 'Beside the photo' }, { value: 'spotlight', label: 'Spotlight' }]} />}
    <ImageField label={s.video ? 'Photo (optional with a video)' : 'Photo'} value={s.image} tenantId={c.tenantId} library={c.photos} suggest={[s.heading, c.shopName]} onChange={(image) => set({ ...s, image })} />
    {c.video?.sections.includes('image_text') && <LoopField value={s.video} c={c} onChange={(video) => set(withVideo(s, video))} />}
    {c.labels && <Text label="Label above the heading" value={s.label} max={24} onChange={(label) => set({ ...s, label })} />}
    <Text label="Heading" value={s.heading} max={60} onChange={(heading) => set({ ...s, heading })} />
    <Text label="Text (a blank line starts a new paragraph)" value={s.text} max={600} multiline onChange={(text) => set({ ...s, text })} />
    <ButtonFields value={s.button} targets={c.targets} onChange={(button) => set({ ...s, button })} />
    <Choice label="Photo on the" value={s.side} onChange={(side) => set({ ...s, side })} options={[{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }]} />
  </>)
}

function Drop({ s, set, c }: { s: SectionOf<'drop_teaser'>; set: Set<SectionOf<'drop_teaser'>>; c: FormCtx }) {
  return (<>
    <Text label="Heading" value={s.heading} max={60} onChange={(heading) => set({ ...s, heading })} />
    <WhenIST label="When (India time)" hint="It hides itself once this has passed." value={s.at} onChange={(at) => at && set({ ...s, at })} />
    <ImageField label="Photo (optional)" value={s.image} tenantId={c.tenantId} library={c.photos} suggest={[s.heading, c.shopName]} onChange={(image) => set({ ...s, image })} />
  </>)
}

function Rich({ s, set }: { s: SectionOf<'rich_text'>; set: Set<SectionOf<'rich_text'>> }) {
  const text = s.body.map((p) => p.map((r) => r.text).join('')).join('\n\n')
  return (<>
    <Text label="Heading (optional)" value={s.heading} max={60} onChange={(heading) => set({ ...s, heading })} />
    <Text label="Text (a blank line starts a new paragraph)" value={text} max={1200} multiline onChange={(t) => set({ ...s, body: t.split(/\n{2,}/).filter((p) => p.trim()).slice(0, 12).map((p) => [{ text: p.slice(0, 600) }]) })} />
    <Choice label="Align" value={s.align} onChange={(align) => set({ ...s, align })} options={[{ value: 'left', label: 'Left' }, { value: 'centre', label: 'Centre' }]} />
  </>)
}

function Logos({ s, set, c }: { s: SectionOf<'logos'>; set: Set<SectionOf<'logos'>>; c: FormCtx }) {
  return (<>
    <Text label="Heading" value={s.heading} max={40} onChange={(heading) => set({ ...s, heading })} />
    {s.images.map((img, i) => <ImageField key={i} label={`Logo ${i + 1}`} value={img} tenantId={c.tenantId} onChange={(v) => set({ ...s, images: v ? s.images.map((x, j) => (j === i ? v : x)) : s.images.filter((_, j) => j !== i) })} />)}
    {s.images.length < 8 && <ImageField label={`Add a logo (${s.images.length} / 8)`} value={null} tenantId={c.tenantId} onChange={(v) => v && set({ ...s, images: [...s.images, v] })} />}
  </>)
}

/** Shop the look: a photo, then up to four pieces; tap the photo to put the chosen piece's dot there (sliders too). */
function Look({ s, set, c }: { s: SectionOf<'shop_the_look'>; set: Set<SectionOf<'shop_the_look'>>; c: FormCtx }) {
  const [at, setAt] = useState(0)
  const piece = s.pieces[at]
  const place = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!piece) return
    const r = e.currentTarget.getBoundingClientRect()
    const x = Math.round(((e.clientX - r.left) / r.width) * 100), y = Math.round(((e.clientY - r.top) / r.height) * 100)
    set({ ...s, pieces: s.pieces.map((p, i) => (i === at ? { ...p, x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) } : p)) })
  }
  const move = (k: 'x' | 'y', v: number) => set({ ...s, pieces: s.pieces.map((p, i) => (i === at ? { ...p, [k]: v } : p)) })
  const unused = c.products.filter((p) => !s.pieces.some((x) => x.handle === p.handle))
  return (<>
    <Text label="Heading" value={s.heading} max={60} onChange={(heading) => set({ ...s, heading })} />
    <ImageField label="Photo" value={s.image} tenantId={c.tenantId} library={c.photos} suggest={[s.heading, c.shopName]} onChange={(image) => set({ ...s, image })} />
    {s.image && (
      <div className="space-y-1">
        <button type="button" onClick={place} disabled={!piece} aria-label={piece ? `Put piece ${at + 1}’s dot where you tap` : 'Add a piece first'} className="relative block w-full overflow-hidden rounded-md">
          <img src={urlFor(s.image.base, s.image.widths[0]!)} alt="" className="aspect-[4/5] w-full object-cover" />
          {s.pieces.map((p, i) => <span key={p.handle} aria-hidden="true" style={{ left: `${p.x}%`, top: `${p.y}%` }} className={`absolute grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-card text-xs font-semibold text-foreground ${i === at ? 'ring-2 ring-foreground' : ''}`}>{i + 1}</span>)}
        </button>
        <p className="text-xs text-muted-foreground">Tap the photo to place the selected piece’s dot.</p>
      </div>
    )}
    <ol className="space-y-2">
      {s.pieces.map((p, i) => (
        <li key={p.handle} className={`flex items-center gap-2 rounded-md px-2 ${i === at ? 'border-2 border-foreground' : 'border border-input'}`}>
          <button type="button" onClick={() => setAt(i)} aria-pressed={i === at} className="min-h-11 flex-1 text-left text-sm">{i + 1} · {c.products.find((x) => x.handle === p.handle)?.title ?? p.handle}</button>
          <button type="button" aria-label={`Remove piece ${i + 1}`} onClick={() => { set({ ...s, pieces: s.pieces.filter((_, j) => j !== i) }); setAt(0) }} className="grid size-9 place-items-center rounded-md"><Icon name="close" className="size-4" /></button>
        </li>
      ))}
    </ol>
    {piece && <>
      <Field label={`Piece ${at + 1}: across`}>{(id) => <input id={id} type="range" min={0} max={100} value={piece.x} onChange={(e) => move('x', Number(e.target.value))} className="w-full" />}</Field>
      <Field label={`Piece ${at + 1}: down`}>{(id) => <input id={id} type="range" min={0} max={100} value={piece.y} onChange={(e) => move('y', Number(e.target.value))} className="w-full" />}</Field>
    </>}
    {s.pieces.length < 4 && unused.length > 0 && <Field label={`Add a piece (${s.pieces.length} of 4)`}>{(id) => (
      <select id={id} value="" onChange={(e) => { if (!e.target.value) return; set({ ...s, pieces: [...s.pieces, { handle: e.target.value, x: 50, y: 50 }] }); setAt(s.pieces.length) }} className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm">
        <option value="">Pick a product…</option>
        {unused.map((p) => <option key={p.handle} value={p.handle}>{p.title}</option>)}
      </select>)}</Field>}
    <p className="text-xs text-muted-foreground">A piece that’s hidden or not listed drops out of the look on the shop.</p>
  </>)
}

/** A design by id: own keys only (a stored id such as `constructor` must not reach a built-in). */
export const designOf = (c: Pick<FormCtx, 'designs'>, id: string) => (c.designs && Object.hasOwn(c.designs, id) ? c.designs[id]! : null)

export function SectionForm({ s, set, c }: { s: SectionInstance; set: (s: SectionInstance) => void; c: FormCtx }) {
  const body = (() => {
    switch (s.key) {
      case 'hero': return <Hero s={s} set={set} c={c} />
      case 'collection_tiles': return <Tiles s={s} set={set} c={c} />
      case 'products': return <Products s={s} set={set} c={c} />
      case 'price_tiles': return <Prices s={s} set={set} />
      case 'promises': return <Promises s={s} set={set} c={c} />
      case 'image_text': return <ImageText s={s} set={set} c={c} />
      case 'drop_teaser': return <Drop s={s} set={set} c={c} />
      case 'rich_text': return <Rich s={s} set={set} />
      case 'logos': return <Logos s={s} set={set} c={c} />
      case 'shop_the_look': return <Look s={s} set={set} c={c} />
      case 'story_fan': return <StoryFanForm s={s} set={set} c={c} />
      case 'statement': return <StatementForm s={s} set={set} c={c} />
      case 'design': { const d = designOf(c, s.design); return d ? <DesignForm s={s} set={set as (x: SectionOf<'design'>) => void} c={c} d={d} /> : null }
    }
  })()
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">{sectionName(s, c.designs)}</h2>
      {body}
      {/* The Statement is always white words on its darkened photo: no colours to choose. */}
      {s.key !== 'statement' && <Choice label="Colours" value={s.scheme} onChange={(scheme) => set({ ...s, scheme })} options={c.schemes.map((x) => ({ value: x.key, label: x.name }))} />}
    </div>
  )
}
