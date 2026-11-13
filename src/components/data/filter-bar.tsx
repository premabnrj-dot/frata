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

/** `label` names the chip (its × says "Remove …"); `lead` and `value`, when given, show the value in bold, as drawn. */
export type FilterChip = { label: string; href: string; lead?: string; value?: string }

export function FilterBar({ chips, clearHref, add, summary }: { chips: FilterChip[]; clearHref: string; add: ReactNode; summary?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-filter-bar="">
      {chips.map((c) => (
        // Neel § Finding: a chip is 6 px round, the n50 fill, no shadow at rest; the value in bold.
        <span key={c.label} className="inline-flex h-7 items-center gap-1 rounded-sm border border-border bg-side pl-2.5 pr-1 text-label">
          {c.lead && c.value ? <>{c.lead} <b className="font-semibold">{c.value}</b></> : c.label}
          {/* 24 px on a desktop, a 44 px reach on a phone (the hit area grows past the chip, never the chip). */}
          <Link href={c.href} scroll={false} aria-label={`Remove ${c.label}`} className="relative inline-grid size-6 place-items-center rounded-xs text-muted-foreground after:absolute after:-inset-2.5 hover:bg-accent hover:text-foreground md:after:inset-0">
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
