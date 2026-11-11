'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { MAX_COMMERCE_DESIGNS, MAX_PER_PAGE, SECTION_INFO, SECTION_KEYS, SECTION_KINDS, SECTION_NAMES, searchDesigns, searchSections, type SectionKey } from '@/domains/themes/sections'

/** A design as the library shows it (Theme Studio TS0b); its picture is drawn on the server (speed review 4). */
export type LibraryDesign = { id: string; name: string; line: string; tags: string[]; thumb: React.ReactNode
  /** TS1b: it draws pieces or collections (≤ MAX_COMMERCE_DESIGNS shown on a page). */
  commerce?: boolean }
import { Icon } from '@/components/icons/icon'

// =============================================================================
// The section library (Look v3 § Sections): search by name, words or tags ("/" focuses it; matches highlighted),
// kinds down the side with counts, picture cards drawn from each section's shape, "Fits <theme>" on by default (off:
// the sections this theme doesn't take show greyed), a full section greyed with its limit, and where it will land.
// =============================================================================

export function SectionLibrary({ open, onClose, onAdd, allowed, made, themeName, count, after, designs = [], commerce = 0 }: {
  open: boolean; onClose: () => void; onAdd: (k: SectionKey, design?: string) => void
  allowed: SectionKey[]; made: SectionKey[]; themeName: string; count: (k: SectionKey) => number; after: string | null
  designs?: LibraryDesign[]
  /** Shown designs on the page that draw pieces or collections. */
  commerce?: number
}) {
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('All')
  const [fitOnly, setFitOnly] = useState(true)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (open) { setQ(''); setKind('All'); setTimeout(() => input.current?.focus(), 30) } }, [open])
  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => { if (e.key === '/' && document.activeElement !== input.current) { e.preventDefault(); input.current?.focus() } }
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key)
  }, [open])
  const pool = useMemo(() => (fitOnly ? SECTION_KEYS.filter((k) => allowed.includes(k)) : [...SECTION_KEYS]), [fitOnly, allowed])
  // Made for this theme first, then the rest in library order.
  const ordered = useMemo(() => [...pool].sort((a, b) => Number(made.includes(b)) - Number(made.includes(a))), [pool, made])
  // TS0b: designs are listed one by one (by name), never as the bare `design` key.
  const found = searchSections(q, ordered.filter((k) => k !== 'design'))
  const dFound = allowed.includes('design') ? searchDesigns(q, designs) : []
  const kinds = SECTION_KINDS.map((k) => ({ name: k.name, n: k.name === 'Designs' ? dFound.length : found.filter((x) => k.keys.includes(x)).length }))
    .filter((k) => (k.name === 'Designs' ? allowed.includes('design') && designs.length > 0 : pool.some((x) => SECTION_KINDS.find((y) => y.name === k.name)!.keys.includes(x))))
  const shown = kind === 'All' ? found : found.filter((x) => SECTION_KINDS.find((k) => k.name === kind)?.keys.includes(x))
  const dShown = kind === 'All' || kind === 'Designs' ? dFound : []
  const dFull = count('design') >= MAX_PER_PAGE.design
  return (
    <Dialog open={open} onClose={onClose} title="Add a section" className="md:w-[min(60rem,calc(100vw-2rem))]"
      actions={<><span className="mr-auto self-center text-sm text-muted-foreground">{after ? <>Adds below <b className="font-medium text-foreground">{after}</b></> : 'Adds at the end'}</span><button type="button" data-autofocus onClick={onClose} className="min-h-10 rounded-md border border-input px-4 text-sm">Close</button></>}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-h-10 min-w-[12rem] flex-1 items-center gap-2 rounded-lg border border-input bg-card px-3 focus-within:ring-2 focus-within:ring-ring">
          <Icon name="search" className="size-4 text-muted-foreground" /><span className="sr-only">Search sections</span>
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sections" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
          <kbd className="rounded border border-border px-1.5 font-mono text-xs text-muted-foreground">/</kbd>
        </label>
        <button type="button" aria-pressed={fitOnly} onClick={() => setFitOnly((f) => !f)} className={`min-h-9 rounded-full border px-3 text-sm transition-colors duration-fast ${fitOnly ? 'border-foreground bg-foreground text-background' : 'border-input'}`}>Fits {themeName}</button>
      </div>
      <div className="grid min-h-[22rem] gap-3 md:grid-cols-[11rem_minmax(0,1fr)]">
        <nav aria-label="Kinds" className="flex gap-1 overflow-x-auto md:flex-col">
          {[{ name: 'All', n: found.length + dFound.length }, ...kinds].map((k) => (
            <button key={k.name} type="button" aria-current={kind === k.name ? 'true' : undefined} onClick={() => setKind(k.name)}
              className={`flex min-h-9 shrink-0 items-center justify-between gap-3 rounded-md px-3 text-left text-sm ${kind === k.name ? 'bg-muted font-semibold' : 'text-muted-foreground hover:bg-muted'}`}>{k.name}<span className="font-mono text-xs">{k.n}</span></button>
          ))}
        </nav>
        {shown.length || dShown.length ? (
          <ul className="grid content-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {dShown.map((d) => { const why = dFull ? `At most ${MAX_PER_PAGE.design} designs on a page` : d.commerce && commerce >= MAX_COMMERCE_DESIGNS ? `At most ${MAX_COMMERCE_DESIGNS} designs with pieces or collections on a page` : null; return (
              <li key={`d-${d.id}`}>
                <button type="button" disabled={!!why} onClick={() => onAdd('design', d.id)} title={why ?? undefined}
                  className="group w-full overflow-hidden rounded-xl border border-border bg-card text-left transition-[translate,border-color] duration-base ease-standard hover:border-input disabled:opacity-50 [@media(hover:hover)]:enabled:hover:-translate-y-0.5">
                  <span className="block bg-muted text-foreground">{d.thumb}</span>
                  <span className="block space-y-1 p-3">
                    <span className="flex items-center gap-2 font-semibold"><Mark text={d.name} q={q} />
                      <span className="ml-auto rounded-full bg-ok px-2 py-0.5 text-xs font-medium text-ok-text">Made for {themeName}</span></span>
                    <span className="block text-sm text-muted-foreground">{why ?? <Mark text={d.line} q={q} />}</span>
                  </span>
                </button>
              </li>
            ) })}
            {shown.map((k) => {
              const fits = allowed.includes(k), full = count(k) >= MAX_PER_PAGE[k]
              return (
                <li key={k}>
                  <button type="button" disabled={!fits || full} onClick={() => onAdd(k)} title={full ? `At most ${MAX_PER_PAGE[k]} on a page` : undefined}
                    className="group w-full overflow-hidden rounded-xl border border-border bg-card text-left transition-[translate,border-color] duration-base ease-standard hover:border-input disabled:opacity-50 [@media(hover:hover)]:enabled:hover:-translate-y-0.5">
                    <span className="block bg-muted text-foreground"><SectionThumb k={k} /></span>
                    <span className="block space-y-1 p-3">
                      <span className="flex items-center gap-2 font-semibold"><Mark text={SECTION_NAMES[k]} q={q} />
                        <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${!fits ? 'bg-muted text-muted-foreground' : made.includes(k) ? 'bg-ok text-ok-text' : 'bg-muted text-muted-foreground'}`}>{!fits ? `Not in ${themeName}` : made.includes(k) ? `Made for ${themeName}` : 'Fits'}</span></span>
                      <span className="block text-sm text-muted-foreground">{full ? `At most ${MAX_PER_PAGE[k]} on a page` : <Mark text={SECTION_INFO[k].blurb} q={q} />}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : <p className="self-center text-center text-sm text-muted-foreground">Nothing called “{q}”. Try “photo”, “sale” or “trust”.</p>}
      </div>
    </Dialog>
  )
}

/** The first word typed, marked where it appears. */
function Mark({ text, q }: { text: string; q: string }) {
  const w = q.trim().toLowerCase().split(/\s+/)[0] ?? ''
  const i = w ? text.toLowerCase().indexOf(w) : -1
  if (i < 0) return <>{text}</>
  return <>{text.slice(0, i)}<mark className="rounded-sm bg-brand/20 text-inherit">{text.slice(i, i + w.length)}</mark>{text.slice(i + w.length)}</>
}

/** A small drawing of each section's shape (decorative: the name is beside it). */
export function SectionThumb({ k }: { k: SectionKey }) {
  const r = (x: number, y: number, w: number, h: number, o = 0.25, key?: string | number) => <rect key={key ?? `${x}-${y}`} x={x} y={y} width={w} height={h} rx={2} fill="currentColor" opacity={o} />
  const body: Record<SectionKey, React.ReactNode> = {
    hero: <>{r(0, 0, 160, 90, 0.18)}{r(12, 52, 70, 10, 0.7)}{r(12, 68, 34, 9, 0.85)}</>,
    drop_teaser: <>{r(0, 15, 160, 60, 0.75)}{r(45, 34, 70, 9, 0.18)}{r(60, 50, 40, 6, 0.18)}</>,
    products: <>{[0, 1, 2, 3].map((i) => r(10 + i * 36, 18, 32, 44, 0.22, i))}{[0, 1, 2, 3].map((i) => r(10 + i * 36, 66, 22, 4, 0.5, `t${i}`))}</>,
    price_tiles: <>{r(10, 30, 66, 30, 0.25)}{r(84, 30, 66, 30, 0.25)}{r(24, 42, 38, 6, 0.6)}{r(98, 42, 38, 6, 0.6)}</>,
    collection_tiles: <>{[0, 1, 2].map((i) => r(10 + i * 48, 14, 44, 56, 0.25, i))}{[0, 1, 2].map((i) => r(10 + i * 48, 74, 26, 5, 0.6, `t${i}`))}</>,
    image_text: <>{r(10, 12, 66, 66, 0.25)}{r(86, 30, 56, 8, 0.7)}{r(86, 44, 60, 4, 0.4)}{r(86, 52, 50, 4, 0.4)}</>,
    shop_the_look: <>{r(10, 10, 66, 70, 0.25)}<circle cx="38" cy="36" r="5" fill="currentColor" opacity={0.8} /><circle cx="56" cy="58" r="5" fill="currentColor" opacity={0.8} />{r(86, 22, 14, 18, 0.3)}{r(104, 26, 40, 5, 0.5)}{r(86, 46, 14, 18, 0.3)}{r(104, 50, 40, 5, 0.5)}</>,
    rich_text: <>{r(40, 24, 80, 8, 0.7)}{r(26, 40, 108, 4, 0.4)}{r(30, 48, 100, 4, 0.4)}{r(36, 56, 88, 4, 0.4)}</>,
    promises: <>{[0, 1, 2].map((i) => r(10 + i * 48, 30, 44, 30, 0.15, i))}{[0, 1, 2].map((i) => r(18 + i * 48, 43, 28, 4, 0.55, `t${i}`))}</>,
    logos: <>{r(56, 20, 48, 5, 0.5)}{[0, 1, 2, 3].map((i) => r(14 + i * 36, 44, 28, 14, 0.35, i))}</>,
    story_fan: <>{r(14, 28, 30, 40, 0.15)}{r(116, 28, 30, 40, 0.15)}{r(34, 22, 34, 48, 0.25)}{r(92, 22, 34, 48, 0.25)}{r(60, 14, 40, 60, 0.45)}</>,
    statement: <>{r(0, 0, 160, 90, 0.3)}{r(66, 34, 28, 4, 0.6)}{r(40, 44, 80, 12, 0.85)}</>,
    // TS0b: a design is drawn from its own blocks (DesignThumb); this is the bare key's fallback.
    design: <>{r(10, 14, 60, 8, 0.7)}{r(10, 28, 66, 50, 0.25)}{r(86, 28, 64, 50, 0.25)}</>,
  }
  return <svg viewBox="0 0 160 90" className="block h-24 w-full" aria-hidden="true">{body[k]}</svg>
}

