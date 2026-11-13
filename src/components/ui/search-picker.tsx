'use client'

import { useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { FIELD } from './field'

// =============================================================================
// FILE: src/components/ui/search-picker.tsx — ONE PICKER FOR CATEGORY, HSN, PRODUCT, PIN CODE (Neel N0b,
// § More components · Search picker).
//
// A combobox (ARIA 1.2): type, ↑ ↓ move, Enter picks, Esc closes. The typed part of each option in 500, its place on
// the right in small text 2. No match says so; `onCreate` adds "+ Create “…”" under a rule. The list is the caller's
// (filter on the server for a big one, `filter={false}`).
// =============================================================================

export type PickerOption = { id: string; label: string; meta?: ReactNode }

export function SearchPicker({ label, options, onPick, onCreate, placeholder, filter = true, value, onQuery, className }: {
  label: string
  options: PickerOption[]
  onPick: (o: PickerOption) => void
  onCreate?: (text: string) => void
  placeholder?: string
  /** false: the caller filters (from `onQuery`), this shows what it is given. */
  filter?: boolean
  value?: string
  onQuery?: (q: string) => void
  className?: string
}) {
  const id = useId(), list = `${id}-list`
  const [q, setQ] = useState(value ?? '')
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState(0)
  const box = useRef<HTMLInputElement>(null)
  const shown = useMemo(() => !filter || !q.trim() ? options : options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase())), [options, q, filter])
  const canCreate = !!onCreate && q.trim().length > 0 && !shown.some((o) => o.label.toLowerCase() === q.trim().toLowerCase())
  const count = shown.length + (canCreate ? 1 : 0)
  const pick = (i: number) => {
    if (i < shown.length) { const o = shown[i]!; onPick(o); setQ(o.label) } else if (canCreate) onCreate!(q.trim())
    setOpen(false)
  }
  const mark = (text: string) => {
    const t = q.trim(), i = t ? text.toLowerCase().indexOf(t.toLowerCase()) : -1
    return i < 0 ? text : <>{text.slice(0, i)}<b className="font-medium">{text.slice(i, i + t.length)}</b>{text.slice(i + t.length)}</>
  }
  return (
    <div className={cn('relative', className)}>
      <input ref={box} role="combobox" aria-label={label} aria-expanded={open} aria-controls={list} aria-autocomplete="list"
        aria-activedescendant={open && count ? `${id}-o${at}` : undefined} value={q} placeholder={placeholder} className={`${FIELD} w-full`}
        onChange={(e) => { setQ(e.target.value); onQuery?.(e.target.value); setOpen(true); setAt(0) }}
        onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setAt((a) => Math.min(count - 1, a + 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setAt((a) => Math.max(0, a - 1)) }
          else if (e.key === 'Enter' && open && count) { e.preventDefault(); pick(at) }
          else if (e.key === 'Escape') setOpen(false)
        }} />
      {open ? (
        <div id={list} role="listbox" aria-label={label} className="absolute inset-x-0 top-full z-20 mt-1.5 max-h-72 overflow-auto rounded-lg border border-border bg-popover p-1.5 shadow-md">
          {shown.map((o, i) => (
            <div key={o.id} id={`${id}-o${i}`} role="option" aria-selected={i === at} onMouseDown={(e) => { e.preventDefault(); pick(i) }} onMouseEnter={() => setAt(i)}
              className={cn('flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md px-2.5 text-sm md:min-h-9', i === at && 'bg-select')}>
              <span className="min-w-0 truncate">{mark(o.label)}</span>{o.meta ? <span className="shrink-0 text-small text-muted-foreground">{o.meta}</span> : null}
            </div>
          ))}
          {!shown.length && !canCreate ? <p role="status" className="px-2.5 py-2 text-sm text-muted-foreground">No match for “{q.trim()}”</p> : null}
          {canCreate ? <>{shown.length ? <hr aria-hidden="true" className="my-1.5 border-line-soft" /> : null}
            <div id={`${id}-o${shown.length}`} role="option" aria-selected={at === shown.length} onMouseDown={(e) => { e.preventDefault(); pick(shown.length) }}
              className={cn('flex min-h-11 cursor-pointer items-center rounded-md px-2.5 text-sm font-medium text-link md:min-h-9', at === shown.length && 'bg-select')}>+ Create “{q.trim()}”</div></> : null}
        </div>
      ) : null}
    </div>
  )
}
