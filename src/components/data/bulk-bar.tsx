import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// =============================================================================
// FILE: src/components/data/bulk-bar.tsx — WHAT TO DO WITH THE PICKED ROWS (Neel N1, § Screens · Orders, Products).
//
// Neel 50 with a neel 100 edge, 10 px corners; "2 selected" in neel 800 at the left, the actions at the right as small
// buttons (the first primary when there is one), Clear last. Sticky under the shell's top edge while the list scrolls.
// =============================================================================

export function BulkBar({ count, label, children, className }: { count: number; label: string; children: ReactNode; className?: string }) {
  return (
    <div role="region" aria-label={label}
      className={cn('sticky top-[var(--shell-top,0px)] z-10 flex flex-wrap items-center gap-2 rounded-mid border border-halo bg-select py-2 pr-2 pl-3.5 text-sm', className)}>
      <b role="status" className="font-semibold text-select-foreground">{count} selected</b>
      <span className="flex-1" />
      {children}
    </div>
  )
}
