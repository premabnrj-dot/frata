'use client'

import { useRef } from 'react'
import { cn } from '@/lib/utils'

// =============================================================================
// FILE: src/components/ui/segmented.tsx — ONE CHOICE OF A FEW, SIDE BY SIDE (Neel N0, § Components).
//
// A radiogroup: the chosen one is white with e1 on a sunk track (10 px corners, the soft line); the others in text 2.
// One tab stop (the chosen one); ← → ↑ ↓ move and choose, as radios do. 30 px on a desktop, 44 on a phone.
// For two to four short words; more than that is a Select.
// =============================================================================

export function Segmented<T extends string>({ label, value, options, onPick, invalid, className }: {
  label: string
  value: T
  options: readonly (readonly [T, string])[]
  onPick: (v: T) => void
  /** The field's mistake marks (fieldProps): on each choice, so focus can land on the first. */
  invalid?: Record<string, unknown>
  className?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const step = (by: number) => {
    const at = options.findIndex(([v]) => v === value)
    const next = (at + by + options.length) % options.length
    onPick(options[next]![0])
    requestAnimationFrame(() => box.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus())
  }
  return (
    <div ref={box} role="radiogroup" aria-label={label} className={cn('inline-flex flex-wrap gap-0.5 rounded-mid border border-line-soft bg-sunk p-[3px]', className)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); step(1) }
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); step(-1) }
      }}>
      {options.map(([v, words]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} tabIndex={value === v ? 0 : -1} {...invalid} onClick={() => onPick(v)}
          className={cn('min-h-11 rounded-[7px] px-3 text-label font-medium transition-colors duration-fast ease-standard md:min-h-[30px]',
            value === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>{words}</button>
      ))}
    </div>
  )
}
