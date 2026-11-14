import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// =============================================================================
// FILE: src/components/ui/long-job.tsx — A JOB THAT TAKES A WHILE (Neel N0b, § States · Long jobs).
//
// What it is doing, the count ("640 of 1,240"), a bar, the rows to fix and Pause; Done says what is next (the
// caller swaps the action). The bar is a progressbar with its numbers; leaving the page asks first (the caller's
// useLeaveGuard).
// =============================================================================

export function LongJob({ title, done, total, note, action, className }: {
  title: ReactNode; done: number; total: number; note?: ReactNode; action?: ReactNode; className?: string
}) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
  return (
    <div className={cn('grid gap-2.5 rounded-lg border border-border bg-card p-3.5', className)}>
      <div className="flex flex-wrap justify-between gap-2"><b className="text-sm font-medium">{title}</b>
        <span className="font-num text-small text-muted-foreground">{done.toLocaleString('en-IN')} of {total.toLocaleString('en-IN')}</span></div>
      <ProgressBar value={pct} label={typeof title === 'string' ? title : 'Progress'} />
      {note || action ? <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-small text-muted-foreground">{note}</span>{action}</div> : null}
    </div>
  )
}

/** A 6 px bar in the action colour on the soft line (an upload, a job, a quota). */
export function ProgressBar({ value, label, className }: { value: number; label: string; className?: string }) {
  return (
    <span role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} className={cn('block h-1.5 overflow-hidden rounded-full bg-line-soft', className)}>
      <i className="block h-full origin-left rounded-full bg-primary transition-transform duration-base ease-standard" style={{ transform: `scaleX(${value / 100})` }} />
    </span>
  )
}
