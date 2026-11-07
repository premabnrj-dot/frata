import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { Name } from '@/components/data/name'
import { ViewTabs } from '@/components/ui/view-tabs'
import { Money, Numeric } from '@/components/data/numeric'
import { Badge } from '@/components/ui/badge'
import { button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { paise } from '@/domains/money/paise'
import { pick, urlFor } from '@/domains/media/sizes'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { listProducts, statusCounts } from '@/lib/queries/catalogue'
import { StatusBadge } from './_components/status-badge'

export const metadata = { title: 'Products' }

const TABS = [['', 'All'], ['active', 'Active'], ['draft', 'Draft'], ['unlisted', 'Unlisted'], ['archived', 'Archived']] as const

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  const q = await searchParams
  const status = (TABS.find(([k]) => k && k === q.status)?.[0] || null) as Exclude<(typeof TABS)[number][0], ''> | null
  const [rows, counts] = await Promise.all([listProducts(auth.membership.tenantId, 0, status), statusCounts(auth.membership.tenantId)]).catch((err) => { console.error('[products]', err instanceof Error ? err.name : err); return [null, null] as const })
  if (!rows || !counts) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  const add = <Link href="/console/products/new" className={button()}>Add product</Link>
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  if (!total) {
    return (
      <>
        <PageHeader title="Products" />
        <Panel title="No products yet" action={add}>Photos on a model, sizes and colours in one grid, and the size chart for its type. About 10 minutes for the first one.</Panel>
      </>
    )
  }
  return (
    <>
      <PageHeader title="Products" actions={<><Link href="/console/collections" className={button({ variant: 'secondary' })}>Collections</Link>{add}</>} />
      <ViewTabs label="Filter by status" tabs={TABS.map(([k, label]) => ({
        href: k ? `/console/products?status=${k}` : '/console/products', label, current: (status ?? '') === k,
        count: k ? counts[k] ?? 0 : total - (counts.archived ?? 0),
      }))} />
      {!rows.length ? <Panel title={`No ${TABS.find(([k]) => k === status)?.[1].toLowerCase() ?? ''} products`}>Products show here when you set them to this status.</Panel> : <DataTable label="Products">
        <DataTableHead><th className="w-14"><span className="sr-only">Photo</span></th><th>Product</th><th>Status</th><th>Sizes and colours</th><th className="text-right">In stock</th><th className="text-right">Price</th></DataTableHead>
        <DataTableBody>
          {rows.map((r) => (
            <DataTableRow key={r.id}>
              <Td cell="hide">{r.cover
                ? <img src={urlFor(r.cover.base, pick(r.cover.widths, 96))} alt="" width={40} height={50} loading="lazy" className="h-[50px] w-10 rounded-sm object-cover" />
                : <span className="block h-[50px] w-10 rounded-sm bg-muted" aria-hidden="true" />}</Td>
              <Td cell="a"><Link href={`/console/products/${r.handle}`} data-row-link prefetch={false} className="line-clamp-2 min-h-6 py-0.5 font-medium [overflow-wrap:anywhere] hover:underline"><Name>{r.title}</Name></Link>{r.typeName && <span className="hidden text-xs text-muted-foreground md:block">{r.typeName}</span>}</Td>
              <Td cell="d"><StatusBadge status={r.status} publishAt={r.publishAt} /></Td>
              <Td cell="c" className="text-xs text-muted-foreground md:text-sm md:text-foreground">{r.typeName && <span className="md:hidden">{r.typeName} · </span>}<Numeric>{r.variantCount}</Numeric><span className="md:hidden"> sizes and colours</span></Td>
              <Td cell="e" className="text-xs md:text-right md:text-sm">{r.stock > 0 ? <><Numeric>{r.stock}</Numeric><span className="md:hidden"> in stock</span></> : <Badge tone="warn">Sold out</Badge>}</Td>
              <Td cell="b" className="whitespace-nowrap text-right">{r.minPrice === null || r.minPrice === 0 ? <span className="text-muted-foreground">No price</span>
                : r.minPrice === r.maxPrice ? <Money paise={paise(r.minPrice)} /> : <><Money paise={paise(r.minPrice)} />–<Money paise={paise(r.maxPrice!)} /></>}</Td>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>}
    </>
  )
}
