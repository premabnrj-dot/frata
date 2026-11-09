import { Monogram } from './monogram'
import { cn } from '@/lib/utils'

/**
 * Frrata Themes (Look v3, owner's pick "B · The tile", 2026-11-09): the monogram tile, "themes" in the display face,
 * and "by frrata" under it. On Console › Look and the theme cards. `size="sm"` is the badge on a card (tile + word).
 */
export function ThemesLockup({ size = 'md', className }: { size?: 'sm' | 'md'; className?: string }) {
  if (size === 'sm') {
    return (
      <span className={cn('inline-flex items-center gap-1.5 rounded-full bg-muted py-0.5 pl-0.5 pr-2.5 text-xs font-semibold', className)} aria-label="Frrata Themes">
        <Monogram size={18} /><span aria-hidden="true" className="font-display">themes</span>
      </span>
    )
  }
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)} role="img" aria-label="Frrata Themes">
      <Monogram size={40} />
      <span aria-hidden="true" className="grid leading-none">
        <span className="font-display text-2xl font-semibold tracking-tight">themes</span>
        <span className="mt-1 text-[0.625rem] font-medium uppercase tracking-[0.24em] text-muted-foreground">by Frrata</span>
      </span>
    </span>
  )
}
