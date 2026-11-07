import { STROKE, THREAD, WORD, WORDMARK_VIEWBOX } from './mark-paths'
import { cn } from '@/lib/utils'

/**
 * The frrata wordmark (brand spec, direction A). It takes the colour of its text; `thread` draws the first r's arm
 * in the brand colour — for brand surfaces (sign-in, the website), never inside working screens. Its height sets
 * its size; the width follows (about 3.3 × the height).
 */
export function Wordmark({ thread = false, className, label = 'Frrata' }: { thread?: boolean; className?: string; label?: string | null }) {
  return (
    <svg viewBox={WORDMARK_VIEWBOX} fill="none" stroke="currentColor" strokeWidth={STROKE} strokeLinejoin="round"
      className={cn('h-6 w-auto shrink-0', className)} {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
      {WORD.map((d) => <path key={d} d={d} />)}
      <path d={THREAD} className={thread ? 'stroke-brand' : undefined} />
    </svg>
  )
}
