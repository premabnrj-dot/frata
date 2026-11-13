import { X } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

// =============================================================================
// FILE: src/components/data/filter-bar.tsx — A LIST'S FILTERS AS CHIPS (Neel N1c, § Finding things).
//
// Each chip reads "Field is value" and its × is a link to the list without it (the filters live in the address, so
// Back works and a link can be shared). `add` is the list's own "+ Filter"; "Clear all" shows when there is
// something to clear; `summary` sits at the right ("9 of 300 orders"). No state: the page renders it from the address.
// =============================================================================

export type FilterChip = { label: string; href: string }

export function FilterBar({ chips, clearHref, add, summary }: { chips: FilterChip[]; clearHref: string; add: ReactNode; summary?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-filter-bar="">
      {chips.map((c) => (
        <span key={c.label} className="inline-flex h-7 items-center gap-1 rounded-full border border-edge bg-card pl-3 pr-1 text-label font-medium shadow-sm">
          {c.label}
          <Link href={c.href} scroll={false} aria-label={`Remove ${c.label}`} className="inline-grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground">
            <X aria-hidden="true" className="size-3.5" />
          </Link>
        </span>
      ))}
      {add}
      {chips.length > 0 ? <Link href={clearHref} scroll={false} className="inline-flex min-h-6 items-center text-label font-medium text-link underline-offset-2 hover:underline">Clear all</Link> : null}
      {summary ? <span className="ml-auto text-label text-muted-foreground tabular-nums">{summary}</span> : null}
    </div>
  )
}
