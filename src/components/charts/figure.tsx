import type { ReactNode } from 'react'
import type { Change } from '@/domains/analytics/kit'
import { cn } from '@/lib/utils'
import { Sparkline } from './sparkline'

// =============================================================================
// FILE: src/components/charts/figure.tsx — ONE FIGURE (Neel N1b, kit § Figures).
// Its name, the value, its change in words coloured by meaning (kit.ts change), what it is compared with when the row
// asks (`against`, once per row), a sparkline, and a note: what it counted, or how much is still needed.
// =============================================================================

const TONE: Record<Change['tone'], string> = { good: 'text-ok-text', bad: 'text-danger-text', flat: 'text-muted-foreground', none: 'text-muted-foreground' }

export function Figure({ label, value, change, against, note, spark, empty }: {
  label: ReactNode; value: ReactNode; change?: Change | null; against?: string; note?: ReactNode; spark?: number[]
  /** Too little to show a value: the figure says what is needed instead (value shows as "—"). */
  empty?: ReactNode
}) {
  return (
    <div data-figure="" className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-card p-4 max-md:p-3">
      <span className="text-label text-muted-foreground">{label}</span>
      <b className={cn('font-num text-stat font-semibold tabular-nums max-md:text-title', empty && 'text-muted-foreground')}>{empty ? '—' : value}</b>
      {empty ? <span className="text-label text-muted-foreground">{empty}</span> : change ? (
        <span className={cn('text-label', TONE[change.tone])}>{change.words}{against && change.tone !== 'none' ? <span className="max-md:hidden"> {against}</span> : null}</span>
      ) : null}
      {note ? <span className="text-label text-muted-foreground max-md:hidden">{note}</span> : null}
      {spark && spark.length > 1 && !empty ? <Sparkline values={spark} className="max-md:hidden" /> : null}
    </div>
  )
}
