'use client'

import { ChevronDown } from 'lucide-react'
import { useId, useRef } from 'react'
import { cn } from '@/lib/utils'
import { placeUnder } from './anchor'
import { button } from './button'

// =============================================================================
// FILE: src/components/ui/menu.tsx
//
// "MORE": everything but a record's one primary action (design-language § Work
// queues 3). A native popover (Esc and a tap outside close it, top layer) with
// menu semantics: ↑ ↓ Home End move, Enter or Space runs, focus goes to the
// first item on open and back to the button on close. An item that does not
// apply is left out, not greyed: a disabled item explains nothing.
// =============================================================================

export type MenuItem = { label: string; onSelect: () => void; danger?: boolean } | { label: string; href: string; danger?: boolean }

export function Menu({ label = 'More', items, align = 'end' }: { label?: string; items: MenuItem[]; align?: 'start' | 'end' }) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  if (!items.length) return null
  const entries = () => [...(pop.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
  const move = (by: number | 'first' | 'last') => {
    const all = entries(); if (!all.length) return
    const at = all.indexOf(document.activeElement as HTMLElement)
    const next = by === 'first' ? 0 : by === 'last' ? all.length - 1 : (at + by + all.length) % all.length
    all[next]!.focus()
  }
  const close = () => pop.current?.hidePopover()
  const itemClass = (danger?: boolean) => cn('flex min-h-10 w-full items-center rounded-sm px-3 text-left text-sm md:min-h-9 hover:bg-accent focus-visible:bg-accent', danger && 'text-destructive')
  return (
    <>
      <button ref={trigger} type="button" popoverTarget={id} aria-haspopup="menu" aria-expanded={false} aria-controls={id} className={button({ variant: 'secondary' })}>
        {label}<ChevronDown aria-hidden className="size-4" />
      </button>
      <div ref={pop} id={id} popover="auto" data-pop="menu" role="menu" aria-label={label}
        // Said before it shows (beforetoggle is synchronous), so a screen reader never hears a stale state.
        onBeforeToggle={(e) => trigger.current?.setAttribute('aria-expanded', String((e as unknown as ToggleEvent).newState === 'open'))}
        onToggle={(e) => {
          const open = (e as unknown as ToggleEvent).newState === 'open'
          // The popover is shown by the time toggle fires: focus the first item in the same frame (no lag to type into).
          if (open && trigger.current) { placeUnder(trigger.current, e.currentTarget, align); move('first') }
          else trigger.current?.focus()
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
          else if (e.key === 'Home') { e.preventDefault(); move('first') }
          else if (e.key === 'End') { e.preventDefault(); move('last') }
          else if (e.key === 'Tab') close()
        }}
        className="min-w-48 rounded-md border border-border bg-popover p-1 text-popover-foreground">
        {items.map((it) => 'href' in it
          ? <a key={it.label} role="menuitem" href={it.href} tabIndex={-1} className={itemClass(it.danger)} onClick={close}>{it.label}</a>
          : <button key={it.label} type="button" role="menuitem" tabIndex={-1} className={itemClass(it.danger)} onClick={() => { close(); it.onSelect() }}>{it.label}</button>)}
      </div>
    </>
  )
}
