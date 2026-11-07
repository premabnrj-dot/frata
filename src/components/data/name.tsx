import { scriptOf } from '@/domains/text/script'

/**
 * A person's or shop's name as typed (Console and Admin). Indic names get
 * data-script, which globals.css gives line height 1.8 so matras and conjuncts
 * are not clipped; the Noto faces behind Inter (src/components/shell/fonts.ts)
 * draw them, downloaded only when such a name is on the page.
 */
export function Name({ children, className }: { children: string; className?: string }) {
  const s = scriptOf(children)
  return <span data-script={s === 'latin' ? undefined : s} className={className}>{children}</span>
}
