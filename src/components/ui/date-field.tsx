'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { dayIN, dayMonthIN, monthLongYearIN } from '@/lib/format-date'
import { FIELD } from './field'

// =============================================================================
// FILE: src/components/ui/date-field.tsx — A DAY, IN INDIA TIME (Neel N0b, § More components · Select, date, time).
//
// Shown short ("14 Nov"; the year only when it is not this one) in the field; a calendar under it as drawn (Monday first, today ringed, the chosen day in
// neel, other months' days in text 3). Arrow keys move a day or a week, Enter picks, Esc closes. A phone (a coarse
// pointer) gets its own date wheel: the native input. Values are day keys ("2026-11-14"); `today` comes from the
// caller (the server's clock: check:clock), never from the browser's.
// =============================================================================

const key = (d: Date) => d.toISOString().slice(0, 10)
const fromKey = (k: string) => new Date(`${k}T00:00:00Z`)
const addDays = (k: string, n: number) => key(new Date(fromKey(k).getTime() + n * 86_400_000))
const atIST = (k: string) => new Date(`${k}T12:00:00+05:30`)

export function DateField({ label, value, onChange, today, min, max, className }: {
  label: string; value: string | null; onChange: (k: string) => void
  /** Today's day key in India time, from the server. */
  today: string; min?: string; max?: string; className?: string
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [phone, setPhone] = useState(false)
  const [focus, setFocus] = useState(value ?? today)
  const grid = useRef<HTMLDivElement>(null)
  useEffect(() => { setPhone(window.matchMedia('(pointer: coarse)').matches) }, [])
  useEffect(() => { if (open) grid.current?.querySelector<HTMLButtonElement>(`[data-day="${focus}"]`)?.focus() }, [open, focus])
  if (phone) return <input type="date" aria-label={label} value={value ?? ''} min={min} max={max} onChange={(e) => e.target.value && onChange(e.target.value)} className={cn(FIELD, 'w-full', className)} />

  const first = `${focus.slice(0, 7)}-01`
  const lead = (fromKey(first).getUTCDay() + 6) % 7 // Monday first
  const cells = Array.from({ length: 42 }, (_, i) => addDays(first, i - lead))
  const ok = (k: string) => (!min || k >= min) && (!max || k <= max)
  const pick = (k: string) => { if (ok(k)) { onChange(k); setOpen(false) } }
  return (
    <div className={cn('relative', className)}>
      <button type="button" id={id} aria-haspopup="dialog" aria-expanded={open} onClick={() => { setFocus(value ?? today); setOpen((o) => !o) }}
        className={cn(FIELD, 'w-full text-left', !value && 'text-muted-foreground')}>
        <span className="sr-only">{label}: </span>{value ? (value.slice(0, 4) === today.slice(0, 4) ? dayMonthIN(atIST(value)) : dayIN(atIST(value))) : 'Choose a day'}
      </button>
      {open ? (
        <div role="dialog" aria-label={label} className="absolute top-full left-0 z-20 mt-1.5 w-70 rounded-lg border border-border bg-popover p-2.5 shadow-md"
          onKeyDown={(e) => {
            const by = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]
            if (by) { e.preventDefault(); setFocus((f) => addDays(f, by)) }
            else if (e.key === 'Escape') { setOpen(false); document.getElementById(id)?.focus() }
          }}>
          <div className="mb-1.5 flex items-center justify-between">
            <b className="text-sm font-medium" aria-live="polite">{monthLongYearIN(atIST(first))}</b>
            <span className="flex">
              <button type="button" aria-label="Last month" className="grid size-7 place-items-center rounded-md hover:bg-accent" onClick={() => setFocus(addDays(first, -1).slice(0, 7) + '-01')}><ChevronLeft aria-hidden className="size-4" /></button>
              <button type="button" aria-label="Next month" className="grid size-7 place-items-center rounded-md hover:bg-accent" onClick={() => setFocus(addDays(first, 32).slice(0, 7) + '-01')}><ChevronRight aria-hidden className="size-4" /></button>
            </span>
          </div>
          <div ref={grid} role="grid" className="grid grid-cols-7 gap-0.5 text-center text-label">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <i key={i} aria-hidden="true" className="text-kbd not-italic text-muted-foreground">{d}</i>)}
            {cells.map((k) => {
              const inMonth = k.slice(0, 7) === first.slice(0, 7)
              return (
                <button key={k} type="button" data-day={k} tabIndex={k === focus ? 0 : -1} disabled={!ok(k)} aria-pressed={k === value} aria-label={dayIN(atIST(k))}
                  onClick={() => pick(k)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); pick(k) } }}
                  className={cn('grid h-7.5 place-items-center rounded-md disabled:opacity-45', k === value ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
                    k === today && k !== value && 'shadow-[inset_0_0_0_1px_var(--border)]', !inMonth && k !== value && 'text-text-3')}>
                  {Number(k.slice(8))}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** A time of day (a select-sized native time field: the browser's own picker, India time by the caller's value). */
export function TimeField({ label, value, onChange, className }: { label: string; value: string; onChange: (v: string) => void; className?: string }) {
  return <input type="time" aria-label={label} value={value} step={900} onChange={(e) => onChange(e.target.value)} className={cn(FIELD, 'w-full font-num', className)} />
}
