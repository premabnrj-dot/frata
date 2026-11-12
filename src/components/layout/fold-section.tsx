'use client'

import { useId, useState, type ReactNode } from 'react'
import { Icon } from '@/components/icons/icon'
import { cn } from '@/lib/utils'

/**
 * A card (the one Section frame) whose body folds to its title line: a section with nothing in it yet, so the page
 * shows what is filled and one line for each thing that could be (products PR·2, mockup § The editor). Disclosure
 * pattern: the heading holds a button with aria-expanded; anything beside the title (an info tip, an action) sits outside
 * that button, so a tip never toggles the fold. The body stays mounted (hidden), so what was typed survives a fold.
 * `start` is decided once by the caller, from what was saved, never from what is being typed. Only sections no save
 * can mark a mistake in are folded (Details, the model): a field with a mistake must never be hidden.
 */
export function FoldSection({ title, side, summary, start, children }: {
  title: string; side?: ReactNode; summary?: ReactNode; start: boolean; children: ReactNode
}) {
  const [shown, setShown] = useState(start)
  const body = useId()
  return (
    <section aria-labelledby={`${body}-h`} className="space-y-3 rounded-md border border-border bg-card p-4 md:p-5">
      <div className="flex items-center gap-2">
        <h2 id={`${body}-h`} className="min-w-0 flex-1 text-section font-semibold">
          <button type="button" aria-expanded={shown} aria-controls={body} onClick={() => setShown((s) => !s)}
            className="flex min-h-6 w-full items-center gap-2 text-left">
            <Icon name="chevron" className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-fast', shown && 'rotate-90')} />
            <span>{title}</span>
            {!shown && summary && <span className="min-w-0 truncate text-sm font-normal text-muted-foreground">{summary}</span>}
          </button>
        </h2>
        {side}
      </div>
      <div id={body} hidden={!shown} className="space-y-3">{children}</div>
    </section>
  )
}
