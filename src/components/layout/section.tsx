import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A card on a page (frata-design-language § UX foundation rule 14): ONE frame, one padding, one title size, in
 * Console and Admin. Never cards inside cards; a hand-written frame in a page fails check:scale.
 */
export function Section({ title, action, children, className, id, labelledBy }: {
  title?: ReactNode
  action?: ReactNode
  children?: ReactNode
  className?: string
  id?: string
  /** When the title is a <label> inside children (a single-field card), name the region by that id instead. */
  labelledBy?: string
}) {
  const h = id ? `${id}-h` : undefined
  return (
    <section id={id} aria-labelledby={labelledBy ?? (title ? h : undefined)} className={cn('space-y-3 rounded-md border border-border bg-card p-4 md:p-5', className)}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3">
          {title && <h2 id={h} className="text-section font-semibold">{title}</h2>}
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  )
}
