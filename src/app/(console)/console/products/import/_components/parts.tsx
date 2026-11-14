import type { ReactNode } from 'react'
import { Section } from '@/components/layout/section'
import { cn } from '@/lib/utils'

// The import's small pieces, as the approved mockup draws them (docs/mockups/2026-11-11-import-and-order-edit.html):
// the step strip, a count tile, the bar.

const STEPS = ['File', 'Check', 'Import'] as const

/** File — Check — Import: the current step filled, the ones before it ticked. */
export function Steps({ at }: { at: 0 | 1 | 2 | 3 }) {
  return (
    <ol aria-label="Steps" className="flex flex-wrap items-center gap-1.5 text-xs">
      {STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-1.5" aria-current={i === at ? 'step' : undefined}>
          {i > 0 && <span aria-hidden="true" className="h-px w-4 bg-border" />}
          <span className={cn('inline-grid size-5 place-items-center rounded-full border text-xs font-semibold',
            i < at ? 'border-transparent bg-ok text-ok-text' : i === at ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground')}>
            {i < at ? <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg> : i + 1}
          </span>
          <span className={i === at ? 'font-semibold text-foreground' : 'text-muted-foreground'}>{s}{i < at && <span className="sr-only"> (done)</span>}</span>
        </li>
      ))}
    </ol>
  )
}

/** One count: the number large, what it counts under it, and its button when it has one. */
export function Count({ value, label, bad = false, children }: { value: number; label: ReactNode; bad?: boolean; children?: ReactNode }) {
  return (
    <Section className={cn('grid content-start gap-0.5 space-y-0 px-3.5 py-3 md:px-3.5 md:py-3', bad && value > 0 && 'border-danger-text/40')}>
      <span className="font-num text-2xl font-semibold tabular-nums">{value.toLocaleString('en-IN')}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
      {children && <span className="mt-1.5">{children}</span>}
    </Section>
  )
}

export const Counts = ({ children, label }: { children: ReactNode; label: string }) => (
  <div role="group" aria-label={label} className="grid gap-2.5 sm:grid-cols-3">{children}</div>
)

/** A progress bar that moves by scale (design language rule 29). */
export function Bar({ done, total, label }: { done: number; total: number; label: string }) {
  const share = total ? Math.min(1, done / total) : 0
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} className="h-2 overflow-hidden rounded-full bg-muted">
      <div className="h-full w-full origin-left bg-foreground transition-transform duration-base ease-standard" style={{ transform: `scaleX(${share})` }} />
    </div>
  )
}
