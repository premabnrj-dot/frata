'use client'

import { useEffect, useId, useState, type ReactNode } from 'react'
import { Icon } from '@/components/icons/icon'
import { cn } from '@/lib/utils'

/**
 * A card (the one Section frame) whose body folds to its title line: a section with nothing in it yet, so the page
 * shows what is filled and one line for each thing that could be (products PR·2; Neel N2, mockup § The editor: "Tax ·
 * HSN 6211 · 5% under ₹2,500   Edit"). Disclosure pattern: the heading holds ONE button with aria-expanded; anything
 * beside the title (an info tip) sits outside it, so a tip never toggles the fold. The body stays mounted (hidden), so
 * what was typed survives a fold. `start` is decided once by the caller, from what was saved, never from typing.
 * `invalid`: a save marked a mistake inside — the fold opens itself (the next frame, before focus goes to the first
 * mistake: focusFirstInvalid cannot focus inside a hidden body) and stays open while it is marked.
 */
export function FoldSection({ title, side, summary, start, action, invalid = false, children }: {
  title: string; side?: ReactNode; summary?: ReactNode; start: boolean
  /** The folded line's word at its end, as drawn: "Add" when empty, "Edit" when filled. */
  action?: string
  invalid?: boolean; children: ReactNode
}) {
  const [shown, setShown] = useState(start)
  useEffect(() => { if (invalid) setShown(true) }, [invalid])
  const body = useId()
  return (
    <section aria-labelledby={`${body}-h`} className={cn('rounded-lg border bg-card', shown ? 'space-y-3 border-border p-4 md:px-5 md:pb-5' : 'border-dashed border-line-soft px-4 md:px-5')}>
      <div className="flex items-center gap-2">
        <h2 id={`${body}-h`} className="min-w-0 flex-1 text-section font-semibold">
          <button type="button" aria-expanded={shown} aria-controls={body} onClick={() => setShown((s) => !s)}
            className={cn('flex w-full items-center gap-2 text-left', shown ? 'min-h-11 md:min-h-6' : 'min-h-14 md:min-h-12')}>
            <Icon name="chevron" className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-fast', shown && 'rotate-90')} />
            <span className={shown ? undefined : 'font-normal'}>{title}</span>
            {!shown && summary ? <span className="min-w-0 truncate text-sm font-normal text-muted-foreground">· {summary}</span> : null}
            {!shown && action ? <span className="ml-auto shrink-0 text-sm font-medium text-link">{action}</span> : null}
          </button>
        </h2>
        {side}
      </div>
      <div id={body} hidden={!shown} className="space-y-3">{children}</div>
    </section>
  )
}
