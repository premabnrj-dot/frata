import { cn } from '@/lib/utils'

/** A figure's trend in one line (Neel N1b): decoration beside numbers that say the same, so hidden from readers. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const top = Math.max(...values), bottom = Math.min(...values)
  const span = top - bottom || 1
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * 98 + 1).toFixed(1)} ${(22 - ((v - bottom) / span) * 20).toFixed(1)}`).join(' ')
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true" className={cn('h-6 w-full', className)}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" className="text-chart" />
    </svg>
  )
}
