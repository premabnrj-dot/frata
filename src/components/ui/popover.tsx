'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { placeUnder } from './anchor'

// =============================================================================
// FILE: src/components/ui/popover.tsx — A FEW FIELDS UNDER THE BUTTON THAT OPENED THEM (Neel N2).
// A native popover (top layer, Esc and a tap outside close it) with dialog semantics, named by its heading. Focus goes to
// its first field on open and back to its trigger on close. On a phone (under 768 px) it sits as a sheet at the foot.
// For a list of commands use Menu; for a decision that blocks the page use Dialog.
// =============================================================================

export function Popover({ trigger, title, open, onOpenChange, children, align = 'start' }: {
  /** The button that opens it: rendered here with the popover's wiring; `aria-label` names it fully. */
  trigger: (wire: { popoverTarget: string; 'aria-haspopup': 'dialog'; 'aria-expanded': boolean; 'aria-controls': string; ref: React.Ref<HTMLButtonElement> }) => ReactNode
  title: string
  /** Controlled when given: a field with a mistake inside opens it (the editor's save). */
  open?: boolean; onOpenChange?: (open: boolean) => void
  children: ReactNode; align?: 'start' | 'end'
}) {
  const id = useId()
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const isOpen = useRef(false)
  useEffect(() => {
    const el = pop.current
    if (!el || open === undefined) return
    if (open && !el.matches(':popover-open')) el.showPopover()
    if (!open && el.matches(':popover-open')) el.hidePopover()
  }, [open])
  return (
    <>
      {trigger({ popoverTarget: id, 'aria-haspopup': 'dialog', 'aria-expanded': isOpen.current, 'aria-controls': id, ref: btn })}
      <div ref={pop} id={id} popover="auto" role="dialog" aria-labelledby={`${id}-h`}
        className="w-80 max-w-[calc(100vw-1rem)] rounded-lg border border-border bg-card p-4 text-sm shadow-lg max-md:!inset-x-0 max-md:!top-auto max-md:!bottom-0 max-md:w-full max-md:max-w-none max-md:rounded-b-none"
        onBeforeToggle={(e) => btn.current?.setAttribute('aria-expanded', String((e as unknown as ToggleEvent).newState === 'open'))}
        onToggle={(e) => {
          const now = (e as unknown as ToggleEvent).newState === 'open'
          isOpen.current = now
          onOpenChange?.(now)
          if (now) {
            if (btn.current && window.innerWidth >= 768) placeUnder(btn.current, e.currentTarget, align)
            e.currentTarget.querySelector<HTMLElement>('input, select, textarea, button, [tabindex]:not([tabindex="-1"])')?.focus()
          } else if (e.currentTarget.contains(document.activeElement) || document.activeElement === document.body) btn.current?.focus()
        }}>
        <h3 id={`${id}-h`} className="mb-3 text-label font-semibold">{title}</h3>
        {children}
      </div>
    </>
  )
}
