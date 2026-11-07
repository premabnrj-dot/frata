import Link from 'next/link'
import { button } from '@/components/ui/button'
import { Numeric } from './numeric'

/**
 * Pages of a list (Console and Admin): "Showing 1–50 of 300", then Newer/Older (or Previous/Next) as real
 * buttons (≥ 24 px; rule 19). Renders nothing for one page. The count is the list's own query (rule 17).
 */
export function Pager({ first, shown, total, prevHref, nextHref, prevLabel = 'Previous', nextLabel = 'Next', suffix }: {
  first: number; shown: number; total: number; prevHref?: string; nextHref?: string; prevLabel?: string; nextLabel?: string; suffix?: string
}) {
  if (!prevHref && !nextHref) return null
  const n = (x: number) => x.toLocaleString('en-IN')
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center gap-3 text-sm">
      <span className="text-muted-foreground">Showing <Numeric>{n(first)}–{n(first + shown - 1)}</Numeric> of <Numeric>{n(total)}</Numeric>{suffix ? `, ${suffix}` : ''}</span>
      <span className="flex gap-2">
        {prevHref && <Link href={prevHref} className={button({ variant: 'secondary' })}>{prevLabel}</Link>}
        {nextHref && <Link href={nextHref} className={button({ variant: 'secondary' })}>{nextLabel}</Link>}
      </span>
    </nav>
  )
}
