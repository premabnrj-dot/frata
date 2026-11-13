import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// =============================================================================
// FILE: src/components/data/activity.tsx — WHAT HAPPENED, NEWEST FIRST (Neel N0b, § More components · Activity).
//
// Who, what, when: the event in 600, the rest after it, the time below in small text 2. A support visit's actions say
// "Frrata support" (the caller's words). A rail on the left with a ring per event.
// =============================================================================

export type ActivityItem = { key: string; what: ReactNode; detail?: ReactNode; when: ReactNode }

export function ActivityFeed({ items, label, className }: { items: ActivityItem[]; label: string; className?: string }) {
  return (
    <ol aria-label={label} className={cn('grid content-start gap-3 border-l-2 border-line-soft pl-3.5', className)}>
      {items.map((it) => (
        <li key={it.key} className="relative grid text-sm before:absolute before:top-1.5 before:-left-5 before:size-2.5 before:rounded-full before:border-2 before:border-edge before:bg-card before:content-['']">
          <span><b className="font-semibold">{it.what}</b>{it.detail ? <> {it.detail}</> : null}</span>
          <span className="text-small text-muted-foreground">{it.when}</span>
        </li>
      ))}
    </ol>
  )
}
