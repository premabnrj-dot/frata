'use client'

import { useId, useLayoutEffect, useRef, useState } from 'react'
import { uploadPhoto } from '@/app/(console)/console/products/_components/upload-photos'
import { urlFor } from '@/domains/media/sizes'
import type { SourceSchema, ThemeImage } from '@/domains/themes/sections'
import type { z } from 'zod'
import { Switch as Toggle } from '@/components/ui/switch'
import { Icon } from '@/components/icons/icon'

// The customizer's small controls: each a labelled native control or a group of real buttons (design-language
// primitives; recognition over recall). Limits show as counters, never as a refusal after typing.

export function Field({ label, children, hint }: { label: string; children: (id: string) => React.ReactNode; hint?: string }) {
  const id = useId()
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">{label}</label>
      {children(id)}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

const input = 'h-10 w-full rounded-md border border-input bg-card px-3 text-sm'

export function Text({ label, value, max, onChange, multiline = false }: { label: string; value: string; max: number; onChange: (v: string) => void; multiline?: boolean }) {
  return (
    <Field label={label} hint={`${value.length} / ${max}`}>
      {(id) => multiline
        ? <textarea id={id} value={value} maxLength={max} rows={4} onChange={(e) => onChange(e.target.value)} className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm" />
        : <input id={id} value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} className={input} />}
    </Field>
  )
}

export function Choice<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}
            className={`min-h-9 rounded-md px-3 text-sm ${o.value === value ? 'border-2 border-foreground font-semibold' : 'border border-input'}`}>{o.label}</button>
        ))}
      </div>
    </fieldset>
  )
}

/** The options a theme offers (choicesFor's list; null = all), in the order written here. */
export const offered = <T extends string | number | boolean,>(list: readonly T[] | null, all: { value: T; label: string }[]) => (list ? all.filter((o) => list.includes(o.value)) : all)

/** A choice the theme offers: nothing when it offers one value or none (a single value is not a choice). */
export function Offered<T extends string | number>({ label, value, list, all, onChange }: { label: string; value: T; list: readonly T[] | null; all: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const options = offered(list, all)
  if (options.length < 2) return null
  // Up to four short choices slide (Look v3); more fall back to wrapping buttons.
  return options.length <= 4 ? <div className="space-y-1.5"><p className="text-sm font-medium">{label}</p><Segmented label={label} value={value} options={options} onChange={onChange} full /></div> : <Choice label={label} value={value} options={options} onChange={onChange} />
}
/** An on/off the theme offers: nothing unless it allows both. */
export function OfferedSwitch({ label, on, list, onChange }: { label: string; on: boolean; list: readonly boolean[] | null; onChange: (v: boolean) => void }) {
  return !list || (list.includes(true) && list.includes(false)) ? <Switch label={label} on={on} onChange={onChange} /> : null
}

export function Switch({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <Toggle on={on} onChange={onChange} label={label} />
    </div>
  )
}

export type LinkTarget = { path: string; label: string }
export function LinkPicker({ label, value, targets, onChange, optional = true }: { label: string; value: string | null; targets: LinkTarget[]; onChange: (v: string | null) => void; optional?: boolean }) {
  return (
    <Field label={label}>
      {(id) => (
        <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} className={input}>
          {optional && <option value="">No link</option>}
          {targets.map((t) => <option key={t.path} value={t.path}>{t.label}</option>)}
        </select>
      )}
    </Field>
  )
}

export type LibraryPhoto = { base: string; widths: number[]; width: number; height: number; alt: string; title: string }

/** A photo field's words for a failure, in the merchant's terms (Look v3: friendly fixes, never a code). */
function uploadWhy(f: File, e: unknown): string {
  if (/\.(heic|heif)$/i.test(f.name) || /hei[cf]/.test(f.type)) return 'This is an iPhone HEIC photo this browser can’t open. On the iPhone: Settings › Camera › Formats › Most Compatible, or share it as a JPEG, then try again.'
  return e instanceof Error ? e.message : 'That photo could not be uploaded.'
}

/**
 * One of the shop's photos (Look v3 § Photos): drop it, paste it, choose it, or pick one of the shop's product
 * photos. While it uploads the photo shows at once (from the device) under a progress ring. Once it is in: tap the
 * photo to set the point it keeps in view, replace or remove it, and describe it (with suggestions).
 */
export function ImageField({ label, value, tenantId, onChange, library = [], suggest = [] }: { label: string; value: ThemeImage | null; tenantId: string; onChange: (v: ThemeImage | null) => void
  library?: LibraryPhoto[]; suggest?: string[] }) {
  const id = useId()
  const [progress, setProgress] = useState<number | null>(null)
  const [local, setLocal] = useState<string | null>(null)
  const [error, setError] = useState<{ text: string; file: File } | null>(null)
  const [over, setOver] = useState(false)
  const pick = async (f: File | undefined) => {
    if (!f) return
    setError(null); setProgress(0)
    const url = URL.createObjectURL(f); setLocal(url)
    try {
      const u = await uploadPhoto(f, tenantId, setProgress, 'theme')
      onChange({ ...u, alt: value?.alt ?? '', decorative: false, focus: null })
    } catch (e) { setError({ text: uploadWhy(f, e), file: f }) } finally { setProgress(null); URL.revokeObjectURL(url); setLocal(null) }
  }
  const fromPaste = (e: React.ClipboardEvent) => { const f = [...e.clipboardData.files].find((x) => x.type.startsWith('image/')); if (f) { e.preventDefault(); void pick(f) } }
  const thumb = (b: { base: string; widths: number[] }) => urlFor(b.base, b.widths[0]!)
  const words = [...new Set(suggest.filter(Boolean))].slice(0, 3)
  const input = <input id={id} type="file" accept="image/*" className="sr-only" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }} />
  return (
    <div className="space-y-2.5">
      <p className="text-sm font-medium">{label}</p>
      {progress !== null && local ? (
        <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-muted">
          <img src={local} alt="" className="size-full object-cover opacity-70 saturate-50" />
          <span role="status" className="absolute inset-0 grid place-items-center bg-foreground/25 text-background">
            <svg viewBox="0 0 60 60" className="size-14 -rotate-90" aria-hidden="true"><circle cx="30" cy="30" r="26" fill="none" strokeWidth="4" className="stroke-background/30" /><circle cx="30" cy="30" r="26" fill="none" strokeWidth="4" strokeLinecap="round" className="stroke-background transition-[stroke-dashoffset] duration-base" strokeDasharray="163.4" strokeDashoffset={163.4 * (1 - progress)} /></svg>
            <span className="absolute font-mono text-sm font-semibold">{Math.round(progress * 100)}%</span>
          </span>
        </div>
      ) : value ? (
        <div className="space-y-2.5">
          <div className="group relative aspect-[16/10] overflow-hidden rounded-xl bg-muted">
            <button type="button" aria-label="Set the point the photo keeps in view" className="absolute inset-0 cursor-crosshair"
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onChange({ ...value, focus: { x: Math.round(((e.clientX - r.left) / r.width) * 100), y: Math.round(((e.clientY - r.top) / r.height) * 100) } }) }}>
              <img src={urlFor(value.base, value.widths.at(-1)!)} alt="" className="size-full object-cover" style={{ objectPosition: value.focus ? `${value.focus.x}% ${value.focus.y}%` : undefined }} />
            </button>
            {value.focus && <span aria-hidden="true" className="pointer-events-none absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card ring-1 ring-foreground/40 transition-[left,top] duration-base ease-standard" style={{ left: `${value.focus.x}%`, top: `${value.focus.y}%` }} />}
            <span className="absolute right-2 top-2 flex gap-1">
              <label htmlFor={id} className="grid size-8 cursor-pointer place-items-center rounded-lg bg-card/95 text-foreground shadow-sm" title="Replace"><Icon name="upload" className="size-4" /><span className="sr-only">Replace photo</span></label>
              <button type="button" onClick={() => onChange(null)} className="grid size-8 place-items-center rounded-lg bg-card/95 text-foreground shadow-sm" title="Remove"><Icon name="close" className="size-3.5" /><span className="sr-only">Remove photo</span></button>
            </span>
            {input}
          </div>
          <Text label="Describe the photo" value={value.alt} max={160} onChange={(alt) => onChange({ ...value, alt })} />
          {words.length > 0 && !value.alt && <div className="flex flex-wrap gap-1.5">{words.map((w) => <button key={w} type="button" onClick={() => onChange({ ...value, alt: w.slice(0, 160) })} className="rounded-full border border-dashed border-input px-2.5 py-1 text-xs hover:border-foreground">{w}</button>)}</div>}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={value.decorative} onChange={(e) => onChange({ ...value, decorative: e.target.checked })} />Decorative only (a pattern, a texture)</label>
        </div>
      ) : (
        <>
          <label htmlFor={id} tabIndex={0} onPaste={fromPaste} onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); void pick([...e.dataTransfer.files].find((x) => x.type.startsWith('image/')) ?? e.dataTransfer.files[0]) }}
            className={`grid min-h-32 cursor-pointer place-items-center gap-1 rounded-xl border-[1.5px] border-dashed p-4 text-center transition-[border-color,background-color,scale] duration-base ease-standard ${over ? 'scale-[1.01] border-foreground bg-muted' : 'border-input hover:border-foreground'}`}>
            <Icon name="upload" className="size-6 text-muted-foreground" />
            <span className="font-medium">Drop a photo</span>
            <span className="text-xs text-muted-foreground">or choose one · paste works too</span>
          </label>
          {input}
          {library.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">From your products</p>
              <div className="grid grid-cols-4 gap-1.5">
                {library.slice(0, 8).map((p) => (
                  <button key={p.base} type="button" title={p.title} onClick={() => onChange({ base: p.base, widths: p.widths, width: p.width, height: p.height, alt: (p.alt || p.title).slice(0, 160), decorative: false, focus: null })}
                    className="aspect-square overflow-hidden rounded-lg bg-muted ring-offset-2 transition-[scale] duration-fast ease-snap hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring">
                    <img src={thumb(p)} alt={p.title} className="size-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      {error && <div role="alert" className="space-y-2 rounded-xl border border-danger-text/40 bg-danger p-3 text-sm text-danger-text"><p>{error.text}</p><button type="button" onClick={() => void pick(error.file)} className="font-medium underline underline-offset-4">Try again</button></div>}
    </div>
  )
}

export const rupeesToPaise = (s: string) => { const n = Number(s.replace(/[₹,\s]/g, '')); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null }
export const paiseToRupees = (p: number | null) => (p === null ? '' : String(Math.round(p / 100)))

/**
 * A segmented control (Look v3): real buttons in a track, the chosen one carried by a thumb that slides on the snap
 * curve. Use it for 2–4 short choices; more, or choices that need a picture, are Tiles.
 */
export function Segmented<T extends string | number>({ label, value, options, onChange, full = false }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; full?: boolean }) {
  const track = useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null)
  useLayoutEffect(() => {
    const el = track.current?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (el) setThumb({ x: el.offsetLeft, w: el.offsetWidth })
  }, [value, options.length])
  return (
    <div ref={track} role="group" aria-label={label} className={`relative isolate rounded-lg bg-muted p-0.5 ${full ? 'grid auto-cols-fr grid-flow-col' : 'inline-flex'}`}>
      {thumb && <span aria-hidden="true" className="absolute inset-y-0.5 -z-10 rounded-md bg-card shadow-sm transition-[translate,width] duration-base ease-snap" style={{ width: thumb.w, translate: `${thumb.x}px 0` }} />}
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}
          className={`min-h-8 rounded-md px-3 text-sm font-medium transition-colors duration-fast ${o.value === value ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{o.label}</button>
      ))}
    </div>
  )
}

/**
 * A group of settings that opens and closes (Look v3): its name, an icon, what it is set to now, and a chevron.
 * The body grows open (grid rows 0fr → 1fr, a 200 ms transition; reduced motion: at once).
 */
/** A folding group. `onOpen` (Look v4, page-aware): opening it can open its page in the preview. */
export function Group({ title, icon, value, children, open: start = false, onOpen }: { title: string; icon: React.ReactNode; value?: string; children: React.ReactNode; open?: boolean; onOpen?: () => void }) {
  const [open, setOpen] = useState(start)
  const id = useId()
  return (
    <section className="border-b border-border">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => { if (!open) onOpen?.(); setOpen((o) => !o) }} className="flex min-h-12 w-full items-center gap-3 px-1 text-left font-semibold">
        <span className="text-muted-foreground" aria-hidden="true">{icon}</span><span>{title}</span>
        {value && <span className="ml-auto max-w-[45%] truncate text-xs font-normal text-muted-foreground">{value}</span>}
        <svg viewBox="0 0 24 24" aria-hidden="true" className={`size-4 shrink-0 fill-none stroke-current stroke-2 transition-transform duration-base ease-standard ${value ? '' : 'ml-auto'} ${open ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6" /></svg>
      </button>
      <div id={id} className={`grid transition-[grid-template-rows] duration-base ease-standard ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="min-h-0 overflow-hidden"><div className="space-y-5 px-1 pb-5 pt-1">{children}</div></div>
      </div>
    </section>
  )
}

/** Picture tiles for choices a merchant recognises by sight (layouts, button styles). */
export function Tiles<T extends string>({ label, value, options, onChange, cols = 3 }: { label: string; value: T; options: { value: T; label: string; picture: React.ReactNode; badge?: string }[]; onChange: (v: T) => void; cols?: 2 | 3 | 4 }) {
  if (options.length < 2) return null
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      <div className={`grid gap-2 ${cols === 2 ? 'grid-cols-2' : cols === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
        {options.map((o) => (
          <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}
            className={`group grid gap-1.5 rounded-xl border bg-card p-1.5 text-center text-xs transition-[scale,border-color] duration-fast ease-standard active:scale-[0.97] ${o.value === value ? 'border-foreground shadow-[inset_0_0_0_1px_var(--color-foreground)]' : 'border-border hover:border-input'}`}>
            <span className="grid h-14 place-items-center overflow-hidden rounded-lg bg-muted">{o.picture}</span>
            <span className="font-medium">{o.label}</span>
            {o.badge && <span className="-mt-1 text-[0.625rem] text-ok-text">{o.badge}</span>}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

type Source = z.infer<typeof SourceSchema>
/** Which pieces a list shows (Products' own control; TS1b: a design's product grid reuses it). */
export function SourcePicker({ value: src, collections, onChange, label = 'Show' }: { value: Source; collections: { handle: string; title: string }[]; onChange: (s: Source) => void; label?: string }) {
  return (<>
    <Choice label={label} value={src.kind} onChange={(kind) => onChange(kind === 'best_sellers' ? { kind, days: 90 } : kind === 'collection' ? { kind, handle: collections[0]?.handle ?? 'none' } : kind === 'under_price' ? { kind, maxPaise: 99900 } : { kind })}
      options={[{ value: 'newest', label: 'New in' }, { value: 'best_sellers', label: 'Best sellers' }, { value: 'collection', label: 'A collection' }, { value: 'under_price', label: 'Under a price' }, { value: 'on_sale', label: 'On sale' }, { value: 'back_in_stock', label: 'Back in stock' }]} />
    {src.kind === 'best_sellers' && <>
      <Choice label="Over" value={src.days} onChange={(days) => onChange({ kind: 'best_sellers', days })} options={[{ value: 30, label: '30 days' }, { value: 90, label: '90 days' }]} />
      <p className="text-xs text-muted-foreground">Ranked by delivered orders. Shoppers see the order, never the numbers.</p>
    </>}
    {src.kind === 'back_in_stock' && <p className="text-xs text-muted-foreground">Pieces that sold out for a day or more and came back in the last 30 days, latest first. Hides itself when there are none.</p>}
    {src.kind === 'collection' && <Field label="Collection">{(id) => (
      <select id={id} value={src.handle} onChange={(e) => onChange({ kind: 'collection', handle: e.target.value })} className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm">
        {collections.map((x) => <option key={x.handle} value={x.handle}>{x.title}</option>)}
      </select>)}</Field>}
    {src.kind === 'under_price' && <Field label="Under, in ₹">{(id) => <input id={id} inputMode="numeric" defaultValue={paiseToRupees(src.maxPaise)} onBlur={(e) => { const p = rupeesToPaise(e.target.value); if (p) onChange({ kind: 'under_price', maxPaise: p }) }} className="h-10 w-full rounded-md border border-input bg-card px-3 font-mono text-sm" />}</Field>}
  </>)
}

/** A moment in India time, typed as a date and a time; stored as ISO with +05:30 (Drop teaser's input; TS1b: a design's
 *  date reuses it). Cleared: null. */
export function WhenIST({ label, value, onChange, hint }: { label: string; value: string | null; onChange: (at: string | null) => void; hint?: string }) {
  // Shown in India time whatever offset it was stored with (the schema takes any; this field writes +05:30).
  const local = value && !Number.isNaN(Date.parse(value)) ? new Date(Date.parse(value) + 330 * 60_000).toISOString().slice(0, 16) : ''
  return <Field label={label} hint={hint}>{(id) => <input id={id} type="datetime-local" value={local} onChange={(e) => onChange(e.target.value ? `${e.target.value}:00+05:30` : null)} className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm" />}</Field>
}
