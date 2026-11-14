import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { PictogramName } from '@/components/brand/pictogram'
import { Pictogram } from '@/components/brand/pictogram'

// =============================================================================
// FILE: src/components/ui/empty.tsx — NOTHING HERE, AND WHY (Neel N0b, § More components · Empty, locked, loading).
//
// Empty: first use — a drawing, one line, the action (a dashed frame). NoMatch: a filter or search with nothing — one
// line and the way back. Locked: what the person cannot do and who can. No explanation beyond that (Rule 0).
// =============================================================================

export function Empty({ picto, title, children, className }: { picto?: PictogramName; title: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn('grid justify-items-center gap-2.5 rounded-lg border border-dashed border-edge p-5.5 text-center', className)}>
      {picto ? <span aria-hidden="true" className="grid size-12 place-items-center rounded-lg bg-sunk"><Pictogram name={picto} size={36} /></span> : null}
      <b className="font-semibold">{title}</b>
      {children ? <div className="flex flex-wrap justify-center gap-2">{children}</div> : null}
    </div>
  )
}

export function NoMatch({ title, children, className }: { title: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div role="status" className={cn('grid justify-items-center gap-1 rounded-lg border border-line-soft p-3 text-center', className)}>
      <b className="font-semibold">{title}</b>
      {children}
    </div>
  )
}

export function Locked({ title, who, className }: { title: ReactNode; who: ReactNode; className?: string }) {
  return (
    <div className={cn('grid justify-items-center gap-1 rounded-lg border border-line-soft p-3 text-center', className)}>
      <b className="font-semibold">{title}</b>
      <span className="text-small text-muted-foreground">{who}</span>
    </div>
  )
}

/** A first load: still grey lines, no shimmer (§ Motion). Hidden from a screen reader; the page's busy state says it. */
export function Skeleton({ lines = [40, 70, 55], className }: { lines?: number[]; className?: string }) {
  return (
    <div aria-hidden="true" className={cn('grid gap-2 rounded-lg border border-line-soft p-3', className)}>
      {lines.map((w, i) => <i key={i} className="block h-3 rounded-sm bg-line-soft" style={{ width: `${w}%` }} />)}
    </div>
  )
}
