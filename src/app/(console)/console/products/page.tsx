import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { Name } from '@/components/data/name'
import { ViewTabs } from '@/components/ui/view-tabs'
import { Money, Numeric } from '@/components/data/numeric'
import { Badge } from '@/components/ui/badge'
import { button } from '@/components/ui/button'
import { Menu } from '@/components/ui/menu'
import { Panel } from '@/components/ui/panel'
import { paise } from '@/domains/money/paise'
import { pick, urlFor } from '@/domains/media/sizes'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { bestOffer } from '@/domains/catalogue/availability'
import { listProducts, PRODUCTS_PAGE, statusCounts, type ProductListRow } from '@/lib/queries/catalogue'
import { formatCount } from '@/lib/format'
import { StatusBadge } from './_components/status-badge'

export const metadata = { title: 'Products' }

const TABS = [['', 'All'], ['active', 'Active'], ['draft', 'Draft'], ['unlisted', 'Unlisted'], ['archived', 'Archived']] as const

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; page?: string }> }) {
  const auth = await requireMember(ANY_MEMBER)
  const now = new Date()
  if (!auth.ok) return <Panel title={auth.message} />
  const q = await searchParams
  const status = (TABS.find(([k]) => k && k === q.status)?.[0] || null) as Exclude<(typeof TABS)[number][0], ''> | null
  const term = (q.q ?? '').trim().slice(0, 80)
  const page = Math.max(1, Math.min(1000, Number(q.page) || 1))
  const [list, counts] = await Promise.all([listProducts(auth.membership.tenantId, page - 1, status, term), statusCounts(auth.membership.tenantId)]).catch((err) => { console.error('[products]', err instanceof Error ? err.name : err); return [null, null] as const })
  if (!list || !counts) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  const add = <Link href="/console/products/new" className={button()}>Add product</Link>
  const importLink = <Link href="/console/products/import" className={button({ variant: 'secondary' })}>Import</Link>
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  if (!total) {
    return (
      <>
        <PageHeader title="Products" />
        <Panel title="No products yet" action={<span className="flex flex-wrap justify-center gap-2">{importLink}{add}</span>} />
      </>
    )
  }
  const href = (o: { page?: number }) => {
    const p = new URLSearchParams({ ...(status ? { status } : {}), ...(term ? { q: term } : {}), ...(o.page && o.page > 1 ? { page: String(o.page) } : {}) })
    const qs = p.toString()
    return `/console/products${qs ? `?${qs}` : ''}`
  }
  const pages = Math.max(1, Math.ceil(list.total / PRODUCTS_PAGE))
  // Past the last page (a bookmark, a product deleted): back to the last one.
  if (page > pages) redirect(href({ page: pages }))
  const rows = list.rows
  return (
    <>
      <PageHeader title="Products" actions={<><Menu items={[{ label: 'HSN codes', href: '/console/products/tax' }, { label: 'Collections', href: '/console/collections' }]} /><Link href="/console/products/photos" className={button({ variant: 'secondary' })}>Add photos</Link>{importLink}{add}</>} />
      <ViewTabs label="Filter by status" tabs={TABS.map(([k, label]) => ({
        href: k ? `/console/products?status=${k}` : '/console/products', label, current: (status ?? '') === k,
        count: k ? counts[k] ?? 0 : total - (counts.archived ?? 0),
      }))} />
      <form role="search" action="/console/products" className="mb-3 flex max-w-sm gap-2">
        {status && <input type="hidden" name="status" value={status} />}
        <label htmlFor="product-q" className="sr-only">Search products</label>
        <input id="product-q" name="q" type="search" defaultValue={term} maxLength={80} placeholder="Search name or SKU"
          className="h-10 min-w-0 flex-1 rounded-md border border-input bg-card px-3 text-sm md:h-9" />
      </form>
      {!rows.length ? <Panel title={term ? `No product matches “${term}”` : `No ${TABS.find(([k]) => k === status)?.[1].toLowerCase() ?? ''} products`} /> : <DataTable label="Products">
        <DataTableHead><th className="w-14"><span className="sr-only">Photo</span></th><th>Product</th><th>Status</th><th>Sizes and colours</th><th className="text-right">In stock</th><th className="text-right">Price</th></DataTableHead>
        <DataTableBody>
          {rows.map((r) => (
            <DataTableRow key={r.id}>
              <Td cell="hide">{r.cover
                ? <img src={urlFor(r.cover.base, pick(r.cover.widths, 96))} alt="" width={40} height={50} loading="lazy" className="h-[50px] w-10 rounded-sm object-cover" />
                : <span className="block h-[50px] w-10 rounded-sm bg-muted" aria-hidden="true" />}</Td>
              <Td cell="a"><Link href={`/console/products/${r.handle}`} data-row-link prefetch={false} className="line-clamp-2 min-h-6 py-0.5 font-medium [overflow-wrap:anywhere] hover:underline"><Name>{r.title}</Name></Link>{r.typeName && <span className="hidden text-xs text-muted-foreground md:block">{r.typeName}</span>}</Td>
              <Td cell="d"><StatusBadge status={r.status} publishAt={r.publishAt} now={now} /></Td>
              <Td cell="c" className="text-xs text-muted-foreground md:text-sm md:text-foreground">{r.typeName && <span className="md:hidden">{r.typeName} · </span>}<Numeric>{r.variantCount}</Numeric><span className="md:hidden"> sizes and colours</span></Td>
              <Td cell="e" className="text-xs md:text-right md:text-sm"><StockCell r={r} now={now} /></Td>
              <Td cell="b" className="whitespace-nowrap text-right">{r.minPrice === null ? <span className="text-muted-foreground">No price</span>
                : <>{r.minPrice === r.maxPrice ? <Money paise={paise(r.minPrice)} /> : <><Money paise={paise(r.minPrice)} />–<Money paise={paise(r.maxPrice!)} /></>}
                  {r.unpriced > 0 && <span className="block text-xs text-muted-foreground">{r.unpriced} without a price</span>}</>}</Td>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>}
      {list.total > PRODUCTS_PAGE && (
        <nav aria-label="Pages" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">Showing {formatCount((page - 1) * PRODUCTS_PAGE + 1)}–{formatCount(Math.min(list.total, page * PRODUCTS_PAGE))} of {formatCount(list.total)}</span>
          <span className="flex gap-2">
            {page > 1 && <Link href={href({ page: page - 1 })} className={button({ variant: 'secondary' })}>Previous</Link>}
            {page < pages && <Link href={href({ page: page + 1 })} className={button({ variant: 'secondary' })}>Next</Link>}
          </span>
        </nav>
      )}
    </>
  )
}

/** In stock as a number; otherwise what shoppers see (availability.ts): pre-order and made to order sell at 0. */
function StockCell({ r, now }: { r: ProductListRow; now: Date }) {
  if (r.stock > 0) return <><Numeric>{r.stock}</Numeric><span className="md:hidden"> in stock</span></>
  const o = bestOffer(r.offers, now)
  if (!o || !r.variantCount) return <span className="text-muted-foreground">—</span>
  if (o.kind === 'preorder') return <Badge tone="info">Pre-order</Badge>
  if (o.kind === 'made_to_order') return <Badge tone="neutral">Made to order</Badge>
  return <Badge tone="warn">Sold out</Badge>
}
