import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A card on a page (frata-design-language § UX foundation rule 14): ONE frame, one padding, one title size, in
 * Console and Admin. Never cards inside cards; a hand-written frame in a page fails check:scale.
 */
export function Section({ title, action, children, className, id, labelledBy, flush = false, ariaLabel, as: Tag = 'section' }: {
  title?: ReactNode
  action?: ReactNode
  children?: ReactNode
  className?: string
  id?: string
  /** When the title is a <label> inside children (a single-field card), name the region by that id instead. */
  labelledBy?: string
  /** A list card whose rows run edge to edge (they draw their own padding and rules). */
  flush?: boolean
  ariaLabel?: string
  /** A card that is a nav (Settings' list of sections) is still one frame. */
  as?: 'section' | 'nav'
}) {
  const h = id ? `${id}-h` : undefined
  return (
    <Tag id={id} aria-label={ariaLabel} aria-labelledby={labelledBy ?? (title ? h : undefined)}
      // Neel § Components: 12 px corners; the header 16 from the top, 20 at the sides and foot (16 on a phone), 16 between.
      className={cn('rounded-lg border border-border bg-card', flush ? 'overflow-hidden' : 'space-y-4 p-4 md:px-5 md:pb-5', className)}>
      {(title || action) && (
        // A flush card's rows draw their own padding (px-4); its header lines up with them and centres its action.
        <div className={cn('flex justify-between gap-3', flush ? 'items-center px-4 pt-4 pb-1 md:px-5' : 'items-start')}>
          {title && <h2 id={h} className="text-section font-semibold">{title}</h2>}
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </Tag>
  )
}
