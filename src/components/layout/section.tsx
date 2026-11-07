import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A card on a page (frata-design-language § UX foundation rule 14): the one frame, `p-4 md:p-5`, an optional
 * title (text-section) and action. No hand-written card frames and no card inside a card (check:scale).
 */
export function Section({ title, action, children, className, label }: { title?: string; action?: ReactNode; children: ReactNode; className?: string; label?: string }) {
  return (
    <section aria-label={!title ? label : undefined} className={cn('space-y-4 rounded-md border border-border bg-card p-4 md:p-5', className)}>
      {(title || action) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-section font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}
