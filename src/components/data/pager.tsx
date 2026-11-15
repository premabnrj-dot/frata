import Link from 'next/link'
import { button } from '@/components/ui/button'
import { Numeric } from './numeric'

/**
 * Pages of a list (Console and Admin): "Showing 1–50 of 300", then Previous and Next (Neel § Screens · Orders; the side with no page shown but not pressable) as real
 * buttons (≥ 24 px; rule 19). Renders nothing for one page. The count is the list's own query (rule 17).
 */
export function Pager({ first, shown, total, prevHref, nextHref }: {
  first: number; shown: number; total: number | string; prevHref?: string; nextHref?: string
}) {
  if (!prevHref && !nextHref) return null
  const n = (x: number) => x.toLocaleString('en-IN')
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center gap-3 text-sm">
      <span className="text-muted-foreground">Showing <Numeric>{n(first)}–{n(first + shown - 1)}</Numeric> of <Numeric>{typeof total === 'number' ? n(total) : total}</Numeric></span>
      <span className="flex gap-2">
        {/* Both are always drawn (Neel § Screens · Orders): the side with no page is shown, not pressable, and never a link. */}
        {prevHref ? <Link href={prevHref} className={button({ variant: 'secondary' })}>Previous</Link> : <span aria-disabled="true" className={`${button({ variant: 'secondary' })} cursor-not-allowed opacity-45`}>Previous</span>}
        {nextHref ? <Link href={nextHref} className={button({ variant: 'secondary' })}>Next</Link> : <span aria-disabled="true" className={`${button({ variant: 'secondary' })} cursor-not-allowed opacity-45`}>Next</span>}
      </span>
    </nav>
  )
}
