import { cn } from '@/lib/utils'

// =============================================================================
// FILE: src/components/ui/steps.tsx — WHERE A FLOW HAS GOT TO (Neel N0b, § More components · Copy, share, steps).
//
// Numbered discs: done is a tick in the ok tint, the current one neel with its word in text, the rest outlined in
// text 2. The current one is aria-current="step"; a done one says so to a screen reader.
// =============================================================================

export function Steps({ steps, current, label, className }: { steps: string[]; current: number; label: string; className?: string }) {
  return (
    <ol aria-label={label} className={cn('flex flex-wrap gap-1.5', className)}>
      {steps.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'now' : 'next'
        return (
          <li key={s} aria-current={state === 'now' ? 'step' : undefined}
            className={cn('flex items-center gap-1.5 pr-1.5 text-label font-medium', state === 'now' ? 'text-foreground' : 'text-muted-foreground')}>
            <span aria-hidden="true" className={cn('grid size-5.5 place-items-center rounded-full text-small',
              state === 'done' ? 'bg-ok text-ok-text' : state === 'now' ? 'bg-primary text-primary-foreground' : 'border border-edge')}>
              {state === 'done' ? '✓' : i + 1}
            </span>
            {s}{state === 'done' ? <span className="sr-only"> (done)</span> : null}
          </li>
        )
      })}
    </ol>
  )
}
