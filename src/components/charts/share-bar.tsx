import { cn } from '@/lib/utils'

/** A share as a bar beside its number (Neel N1b, kit § Ranked): the number stays; the bar is its picture. */
export function ShareBar({ share, tone = 'chart', className }: { share: number; tone?: 'chart' | 'muted' | 'bad'; className?: string }) {
  const w = `${Math.max(0, Math.min(1, share)) * 100}%`
  return (
    <span aria-hidden="true" className={cn('block h-2 rounded-full bg-line-soft', className)}>
      <i className={cn('block h-2 rounded-full', tone === 'chart' ? 'bg-chart' : tone === 'bad' ? 'bg-danger-mark' : 'bg-text-3')} style={{ width: w }} />
    </span>
  )
}
