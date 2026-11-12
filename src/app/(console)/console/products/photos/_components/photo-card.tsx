'use client'

import { useId, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Name } from '@/components/data/name'
import { findProducts, type PhotoIndex, type PhotoTarget } from '@/domains/catalogue/import/photos'
import { cn } from '@/lib/utils'

// One chosen photo, as the approved mockup draws it (docs/mockups/2026-11-11-import-and-order-edit.html, Photos):
// the photo (its file name on it), then the product it goes to and its place or colour — or "Which product?".

export type CardState = 'ready' | 'uploading' | 'added' | 'failed'
export type Card = {
  key: string; name: string; preview: string | null; product: PhotoTarget | null; colour: string | null
  place: { i: number; of: number; over: boolean } | null; state: CardState; p: number; suggest: PhotoTarget[]
}

export function PhotoCard({ card, idx, busy, onPick }: { card: Card; idx: PhotoIndex; busy: boolean; onPick: (id: string) => void }) {
  const [changing, setChanging] = useState(false)
  const [broken, setBroken] = useState(false)
  const asking = !card.product || changing
  const locked = busy || card.state === 'added' || card.state === 'uploading'
  return (
    <li className={cn('grid rounded-sm border bg-card text-xs', asking || card.state === 'failed' ? 'border-warn-text' : 'border-border')} data-photo={card.name}>
      <div className="relative grid aspect-[4/5] items-end overflow-hidden rounded-t-sm bg-muted p-1.5">
        {card.preview && !broken && <img src={card.preview} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} className="absolute inset-0 size-full object-cover" />}
        <span className="relative w-fit max-w-full truncate rounded-sm bg-card/80 px-1 font-mono text-muted-foreground">{card.name}</span>
        {card.state === 'uploading' && (
          <span role="progressbar" aria-label={`Uploading ${card.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(card.p * 100)} className="absolute inset-x-1.5 bottom-1 h-1 overflow-hidden rounded-full bg-card">
            <span className="block h-full w-full origin-left bg-ok-text transition-transform duration-base ease-standard" style={{ transform: `scaleX(${card.p})` }} />
          </span>
        )}
      </div>
      <div className="grid min-w-0 gap-0.5 px-2 py-1.5">
        {asking ? (
          <ProductPicker name={card.name} idx={idx} suggest={card.suggest} disabled={locked} onPick={(id) => { setChanging(false); onPick(id) }} onKeep={card.product ? () => setChanging(false) : null} />
        ) : (
          <>
            <b className="line-clamp-2 font-semibold [overflow-wrap:anywhere]"><Name>{card.product!.title}</Name></b>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground">
              {card.state === 'added' ? <Badge tone="ok">Added</Badge>
                : card.state === 'failed' ? <Badge tone="danger">Not added</Badge>
                : card.place?.over ? <Badge tone="warn">No room</Badge>
                : <span>{card.colour ?? (card.place ? `Photo ${card.place.i} of ${card.place.of}` : '')}</span>}
              {!locked && <button type="button" className="inline-flex min-h-6 items-center underline" onClick={() => setChanging(true)}>Change</button>}
            </span>
          </>
        )}
      </div>
    </li>
  )
}

/** "Which product?": a search over the shop's products (in the page: no call per letter), as a combobox. */
function ProductPicker({ name, idx, suggest, disabled, onPick, onKeep }: { name: string; idx: PhotoIndex; suggest: PhotoTarget[]; disabled: boolean; onPick: (id: string) => void; onKeep: (() => void) | null }) {
  const id = useId()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const list = q.trim() ? findProducts(q, idx) : suggest
  const choose = (t: PhotoTarget) => { setOpen(false); setQ(''); onPick(t.id) }
  return (
    <div className="relative grid min-w-0 gap-1">
      <input id={id} role="combobox" aria-label={`Which product is ${name}`} aria-expanded={open && list.length > 0} aria-controls={`${id}-list`} aria-autocomplete="list" autoComplete="off"
        aria-activedescendant={open && list[active] ? `${id}-${active}` : undefined} disabled={disabled}
        value={q} placeholder="Which product?" onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0) }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, list.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
          else if (e.key === 'Enter' && list[active]) { e.preventDefault(); choose(list[active]!) }
          else if (e.key === 'Escape') setOpen(false)
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="h-10 w-full min-w-0 rounded-md border border-input bg-card px-2 text-sm md:h-9" />
      {open && list.length > 0 && (
        <ul id={`${id}-list`} role="listbox" aria-label={`Products for ${name}`} className="absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded-md border border-border bg-card py-1 shadow-md">
          {list.map((t, i) => (
            <li key={t.id} id={`${id}-${i}`} role="option" aria-selected={i === active} onMouseDown={(e) => { e.preventDefault(); choose(t) }} onMouseEnter={() => setActive(i)}
              className={cn('cursor-pointer px-2 py-1.5 text-xs [overflow-wrap:anywhere]', i === active && 'bg-accent')}>
              <Name>{t.title}</Name><span className="block truncate font-mono text-xs text-muted-foreground">{t.skus[0]?.sku ?? `/${t.handle}`}</span>
            </li>
          ))}
        </ul>
      )}
      {onKeep && <button type="button" className="inline-flex min-h-6 items-center justify-self-start underline" onClick={onKeep}>Keep it</button>}
    </div>
  )
}
