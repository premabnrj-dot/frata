import Link from 'next/link'
import { Td } from '@/components/data/data-table'
import { Name } from '@/components/data/name'
import { Money, Numeric } from '@/components/data/numeric'
import { Badge } from '@/components/ui/badge'
import { paise } from '@/domains/money/paise'
import { LabelBadge } from './status-badge'
import type { Row } from './product-table'

/** One product row's cells (products PR·1), shared by the owner's list and a Builder's view-only list (T1c): the same
 *  words and numbers, never a cost. `external` marks a link that opens the store preview. */
export function ProductCells({ r, external = false }: { r: Row; external?: boolean }) {
  return (
    <>
              <Td cell="hide">{r.thumb
                ? <img src={r.thumb} alt="" width={40} height={50} loading="lazy" className="h-[50px] w-10 rounded-sm object-cover" />
                : <span className="block h-[50px] w-10 rounded-sm bg-muted" aria-hidden="true" />}</Td>
              <Td cell="a">
                <Link href={r.href} data-row-link prefetch={false} className="line-clamp-2 min-h-6 py-0.5 font-medium [overflow-wrap:anywhere] hover:underline" aria-label={external ? `Open ${r.title} in preview` : undefined}><Name>{r.title}</Name></Link>
                <span className="block text-small text-muted-foreground">{r.sub}</span>
              </Td>
              <Td cell="d"><LabelBadge label={r.status} /></Td>
              <Td cell="b" className="whitespace-nowrap text-right">{r.minPrice === null ? <span className="text-muted-foreground">No price</span>
                : <>{r.minPrice === r.maxPrice ? <Money paise={paise(r.minPrice)} /> : <><Money paise={paise(r.minPrice)} />–<Money paise={paise(r.maxPrice!)} /></>}
                  {r.unpriced > 0 && <span className="block text-xs text-muted-foreground">{r.unpriced} without a price</span>}</>}</Td>
              <Td cell="e" className="text-xs md:text-right md:text-sm">{typeof r.stock === 'number' ? <><Numeric>{r.stock}</Numeric><span className="md:hidden"> in stock</span></>
                : r.stock === null ? <span className="text-muted-foreground">—</span>
                : <Badge tone={r.stock === 'Sold out' ? 'warn' : r.stock === 'Pre-order' ? 'info' : 'neutral'}>{r.stock}</Badge>}</Td>
              <Td cell="c" className="text-xs text-muted-foreground md:text-sm">
                <span className="inline-flex items-center gap-1.5">{r.sizes}{r.swatches.length > 0 && <span aria-hidden="true" className="inline-flex gap-0.5">{r.swatches.map((h, i) => <i key={i} className="size-3 rounded-full border border-border" style={{ background: h }} />)}</span>}</span>
              </Td>
    </>
  )
}
