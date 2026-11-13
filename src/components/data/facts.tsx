import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

// =============================================================================
// FILE: src/components/data/facts.tsx — FACTS AND A STAT TILE (Neel N0b, § More components · Facts).
//
// Facts: a two-column list, the label left in text 2, the value right (a <dl>). StatTile: a label, the figure and its
// change, the direction said in words ("↑ 12% on last month"), never by colour alone.
// =============================================================================

export function Facts({ rows, className }: { rows: [label: ReactNode, value: ReactNode][]; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-[90px_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm', className)}>
      {rows.map(([k, v], i) => <div key={i} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="min-w-0 [overflow-wrap:anywhere]">{v}</dd></div>)}
    </dl>
  )
}

export function StatTile({ label, value, change, className }: {
  label: ReactNode
  value: ReactNode
  /** The change with its direction in words; `tone` is how it reads for the business (ok = good). */
  change?: { words: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' }
  className?: string
}) {
  return (
    <div className={cn('grid justify-items-start gap-1 rounded-lg border border-border bg-card px-4 py-3.5', className)}>
      <span className="text-label font-medium text-muted-foreground">{label}</span>
      <b className="font-num text-stat font-semibold">{value}</b>
      {change ? <Badge tone={change.tone}>{change.words}</Badge> : null}
    </div>
  )
}
