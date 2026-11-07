import { MONOGRAM, STROKE, THREAD } from './mark-paths'
import { cn } from '@/lib/utils'

/**
 * The frrata monogram: the "rr" in a square (brand spec). `ink` (the default) is an ink square with paper strokes
 * and the thread in the brand colour; `brand` is a rani square with white strokes (on an ink surface, where an ink
 * square would vanish). Under 24 px the stroke is drawn heavier, so the stitch gap stays open.
 */
export function Monogram({ size = 28, tone = 'ink', className }: { size?: number; tone?: 'ink' | 'brand'; className?: string }) {
  const sw = size < 24 ? 18 : size < 40 ? 16 : STROKE
  return (
    <svg width={size} height={size} viewBox={MONOGRAM.viewBox} aria-hidden="true" className={cn('shrink-0', className)}>
      <rect width="120" height="120" rx={MONOGRAM.radius} className={tone === 'brand' ? 'fill-brand' : 'fill-primary'} />
      <g transform={MONOGRAM.translate} fill="none" strokeWidth={sw} strokeLinejoin="round" className={tone === 'brand' ? 'stroke-brand-foreground' : 'stroke-primary-foreground'}>
        {MONOGRAM.parts.map((d) => <path key={d} d={d} />)}
        <path d={THREAD} className={tone === 'brand' ? undefined : 'stroke-brand-on-ink'} />
      </g>
    </svg>
  )
}
