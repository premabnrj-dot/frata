'use client'

import { useEffect, useState } from 'react'
import { Icon } from '@/components/icons/icon'
import { Money } from '@/components/data/numeric'
import { pick, urlFor } from '@/domains/media/sizes'
import { paise } from '@/domains/money/paise'
import { MAX_NOTES, MAX_PAIRS, MAX_STORIES, STORY_LIMITS, type Piece, type Story } from '@/domains/catalogue/stories'
import { findPieces } from '../actions'
import type { Photo } from './photos'

// Signal S3: the product's stories and "Pair it with" (approved board "Product editor", v5). Both save with the
// product (one Save); a story photo uploads at once into the shop's products folder and is checked again on save.

const field = 'w-full rounded-md border border-input bg-card px-3 text-sm'
const iconBtn = 'inline-grid min-h-8 min-w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30'
const addRow = 'w-full rounded-md border border-dashed border-input px-3 py-2.5 text-sm font-medium hover:bg-muted'
const Thumb = ({ base, widths }: { base: string | null; widths: number[] | null }) => base && widths?.length
  ? <img src={urlFor(base, pick(widths, 160))} alt="" width={40} height={48} className="h-12 w-10 shrink-0 rounded-sm bg-muted object-cover" />
  : <div className="h-12 w-10 shrink-0 rounded-sm bg-muted" />
const Count = ({ n, of }: { n: number; of: number }) => <span className="ml-2 text-sm font-normal text-muted-foreground">{n} of {of}</span>

export function StoriesPanel({ stories, onChange, photos, tenantId, enabled, error }: { stories: Story[]; onChange: (s: Story[]) => void; photos: Photo[]; tenantId: string; enabled: boolean; error?: string }) {
  const [open, setOpen] = useState<number | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const [upErr, setUpErr] = useState<string | null>(null)
  const put = (i: number, patch: Partial<Story>) => onChange(stories.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  const move = (i: number, by: -1 | 1) => { const a = [...stories]; [a[i], a[i + by]] = [a[i + by]!, a[i]!]; onChange(a); setOpen(open === i ? i + by : open) }
  async function upload(i: number, file: File | undefined) {
    if (!file) return
    setUpErr(null); setBusy(i)
    try {
      const { uploadPhoto } = await import('./upload-photos')
      const u = await uploadPhoto(file, tenantId, () => {})
      put(i, { image: { ...u, alt: '', decorative: false } })
    } catch (e) { setUpErr(e instanceof Error ? e.message : 'That photo did not upload. Try again.') }
    setBusy(null)
  }
  return (
    <div className="space-y-2">
      <h2 className="text-section font-semibold">Stories{stories.length > 0 && <Count n={stories.length} of={MAX_STORIES} />}</h2>
      {stories.length === 0 && <p className="text-sm text-muted-foreground">Add a story: a photo, a title, a few words, up to 3 numbered notes.</p>}
      {(error || upErr) && <p role="alert" className="rounded-md border border-danger-text/40 px-3 py-2 text-sm font-medium text-danger-text">{error || upErr}</p>}
      <ul className="space-y-2">
        {stories.map((s, i) => (
          <li key={i} className="rounded-md border border-border">
            <div className="flex items-center gap-3 p-2">
              <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
                <Thumb base={s.image?.base ?? null} widths={s.image?.widths ?? null} />
                <span className="min-w-0"><b className="block truncate text-sm">{s.title || `Story ${i + 1}`}</b>
                  <small className="block truncate text-xs text-muted-foreground">{[s.notes.length ? `${s.notes.length} note${s.notes.length > 1 ? 's' : ''}` : '', s.notes.join(', ')].filter(Boolean).join(' · ') || s.text || 'No text yet'}</small></span>
              </button>
              <button type="button" className={iconBtn} aria-label={`Move story ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}><Icon name="up" className="size-4" /></button>
              <button type="button" className={iconBtn} aria-label={`Move story ${i + 1} down`} disabled={i === stories.length - 1} onClick={() => move(i, 1)}><Icon name="down" className="size-4" /></button>
              <button type="button" className={iconBtn} aria-label={`Remove story ${i + 1}`} onClick={() => { onChange(stories.filter((_, j) => j !== i)); setOpen(null) }}><Icon name="close" className="size-3.5" /></button>
            </div>
            {open === i && (
              <div className="space-y-3 border-t border-border p-3">
                <div className="rounded-md border border-dashed border-input p-4 text-center text-sm">
                  {busy === i ? <span>Uploading…</span> : enabled ? (
                    <label className="block cursor-pointer"><b>{s.image ? 'Replace the photo' : 'Drop a photo'}</b><span className="block text-xs text-muted-foreground">or choose one · or one of this product’s photos</span>
                      <input type="file" accept="image/*" className="sr-only" onChange={(e) => upload(i, e.target.files?.[0])} /></label>
                  ) : <span className="text-muted-foreground">Photo storage is not connected.</span>}
                  {photos.length > 0 && <div className="mt-3 flex flex-wrap justify-center gap-2" role="group" aria-label="This product’s photos">
                    {photos.map((ph, k) => <button key={ph.id} type="button" aria-pressed={s.image?.base === ph.base} aria-label={`Use photo ${k + 1}`} className="rounded-sm outline-offset-2 aria-pressed:outline aria-pressed:outline-2 aria-pressed:outline-primary"
                      onClick={() => put(i, { image: { base: ph.base, widths: ph.widths, width: ph.width, height: ph.height, alt: ph.alt ?? '', decorative: false } })}><Thumb base={ph.base} widths={ph.widths} /></button>)}
                  </div>}
                  {s.image && <button type="button" className="mt-2 text-xs underline" onClick={() => put(i, { image: null })}>Remove the photo</button>}
                </div>
                <Text id={`st-${i}`} label="Title" value={s.title} max={STORY_LIMITS.title} onChange={(title) => put(i, { title })} />
                <Text id={`sx-${i}`} label="Text" value={s.text} max={STORY_LIMITS.text} area onChange={(text) => put(i, { text })} />
                <div className="space-y-2">
                  <p className="text-sm font-medium">Numbered notes <span className="font-normal text-muted-foreground">{s.notes.length} of {MAX_NOTES}</span></p>
                  {s.notes.map((n, k) => (
                    <div key={k} className="flex items-center gap-2">
                      <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{k + 1}</span>
                      <input aria-label={`Note ${k + 1}`} value={n} maxLength={STORY_LIMITS.note} onChange={(e) => put(i, { notes: s.notes.map((x, j) => (j === k ? e.target.value : x)) })} className={`${field} h-10 md:h-9`} />
                      <button type="button" className={iconBtn} aria-label={`Remove note ${k + 1}`} onClick={() => put(i, { notes: s.notes.filter((_, j) => j !== k) })}><Icon name="close" className="size-3.5" /></button>
                    </div>
                  ))}
                  {s.notes.length < MAX_NOTES && <button type="button" className={addRow} onClick={() => put(i, { notes: [...s.notes, ''] })}>Add a note</button>}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {stories.length < MAX_STORIES && <button type="button" className={addRow} onClick={() => { onChange([...stories, { image: null, title: '', text: '', notes: [] }]); setOpen(stories.length) }}>Add a story</button>}
    </div>
  )
}

function Text({ id, label, value, max, area, onChange }: { id: string; label: string; value: string; max: number; area?: boolean; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="flex justify-between text-sm font-medium">{label}<i className="font-normal not-italic text-muted-foreground">{[...value].length} / {max}</i></label>
      {area ? <textarea id={id} rows={3} value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} className={`${field} py-2`} />
        : <input id={id} value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} className={`${field} h-10 md:h-9`} />}
    </div>
  )
}

/** What the shop will do with a piece, in words (the board): hidden, or Add / Choose. */
function pieceLine(p: Piece) {
  if (p.status === 'archived') return <span className="text-danger-text">Archived: not shown on the shop</span>
  if (p.status === 'draft') return <span className="text-danger-text">Draft: not shown on the shop</span>
  if (!p.buyable) return <span className="text-danger-text">Sold out: not shown until it’s back</span>
  return <>{p.price !== null && <Money paise={paise(p.price)} />}{' · '}{p.sizes > 1 ? `${p.sizes} sizes: Choose on the shop` : 'one size: Add on the shop'}</>
}

export function PairsPanel({ productId, pairs, onChange, error }: { productId: string; pairs: Piece[]; onChange: (p: Piece[]) => void; error?: string }) {
  const [q, setQ] = useState('')
  const [found, setFound] = useState<Piece[] | null>(null)
  useEffect(() => {
    const term = q.trim()
    if (!term) { setFound(null); return }
    let live = true
    const t = setTimeout(() => { findPieces(productId, term).then((r) => { if (live) setFound(r) }).catch(() => { if (live) setFound([]) }) }, 250)
    return () => { live = false; clearTimeout(t) }
  }, [q, productId])
  const shown = (found ?? []).filter((f) => !pairs.some((p) => p.id === f.id))
  const row = (p: Piece, act: React.ReactNode, dashed = false) => (
    <li key={p.id} className={`flex items-center gap-3 rounded-md border p-2 ${dashed ? 'border-dashed border-input' : 'border-border'}`}>
      <div className={p.status === 'archived' || p.status === 'draft' || !p.buyable ? 'opacity-50' : ''}><Thumb base={p.base} widths={p.widths} /></div>
      <div className="min-w-0 flex-1"><b className="block truncate text-sm">{p.title}</b><small className="block truncate text-xs text-muted-foreground">{pieceLine(p)}</small></div>
      {act}
    </li>
  )
  const btn = 'inline-flex min-h-8 items-center rounded-md border border-input px-3 text-sm font-medium hover:bg-muted'
  return (
    <div className="space-y-2">
      <h2 className="text-section font-semibold">Pair it with{pairs.length > 0 && <Count n={pairs.length} of={MAX_PAIRS} />}</h2>
      {pairs.length === 0 && <p className="text-sm text-muted-foreground">Pick up to 2 pieces shoppers can add from this page.</p>}
      {error && <p role="alert" className="text-sm font-medium text-danger-text">{error}</p>}
      {pairs.length > 0 && <ul className="space-y-2">{pairs.map((p) => row(p, <button type="button" className={btn} aria-label={`Remove ${p.title}`} onClick={() => onChange(pairs.filter((x) => x.id !== p.id))}>Remove</button>))}</ul>}
      {pairs.length < MAX_PAIRS && <>
        <div className="relative">
          <label htmlFor="pair-find" className="sr-only">Find a piece</label>
          <input id="pair-find" type="search" value={q} maxLength={60} placeholder="Find a piece…" onChange={(e) => setQ(e.target.value)} className={`${field} h-10 pr-9 md:h-9`} />
          <Icon name="search" className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        </div>
        {found && (shown.length
          ? <ul className="space-y-2" aria-label="Pieces found">{shown.map((p) => row(p, <button type="button" className={btn} aria-label={`Add ${p.title}`} onClick={() => { onChange([...pairs, p]); setQ('') }}>Add</button>, true))}</ul>
          : <p className="text-sm text-muted-foreground">No piece called “{q.trim()}”.</p>)}
      </>}
    </div>
  )
}
