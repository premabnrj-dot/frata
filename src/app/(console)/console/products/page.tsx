import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { ViewTabs } from '@/components/ui/view-tabs'
import { button } from '@/components/ui/button'
import { Menu } from '@/components/ui/menu'
import { Panel } from '@/components/ui/panel'
import { Pager } from '@/components/data/pager'
import { LiveSearchField } from '@/components/data/live-search-field'
import { bestOffer, statusLabel, type Status } from '@/domains/catalogue/availability'
import { hrefFor, listQuery, type ListFilter } from '@/domains/catalogue/list-query'
import { pick, urlFor } from '@/domains/media/sizes'
import { isSizeOption } from '@/domains/storefront/picker'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { listProducts, manualCollections, PRODUCTS_PAGE, type ProductListRow } from '@/lib/queries/catalogue'
import { sinceIN } from '@/lib/format-date'
import { ProductTable, type Row } from './_components/product-table'
import { SortSelect } from './_components/sort-select'

export const metadata = { title: 'Products' }

const FILTERS: [ListFilter, string][] = [['all', 'All'], ['active', 'Active'], ['draft', 'Draft'], ['unlisted', 'Unlisted'], ['archived', 'Archived'], ['low', 'Low stock']]

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const auth = await requireMember(ANY_MEMBER)
  const now = new Date()
  if (!auth.ok) return <Panel title={auth.message} />
  const query = listQuery(await searchParams)
  const tenantId = auth.membership.tenantId
  const [list, cols] = await Promise.all([listProducts(tenantId, query), manualCollections(tenantId)]).catch((err) => { console.error('[products]', err instanceof Error ? err.name : err); return [null, null] as const })
  if (!list || !cols) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  const add = <Link href="/console/products/new" className={button()}>Add product</Link>
  const importLink = <Link href="/console/products/import" className={button({ variant: 'secondary' })}>Import</Link>
  if (!list.counts.any) {
    return (
      <>
        <PageHeader title="Products" />
        <Panel title="No products yet" action={<span className="flex flex-wrap justify-center gap-2">{importLink}{add}</span>} />
      </>
    )
  }
  const pages = Math.max(1, Math.ceil(list.total / PRODUCTS_PAGE))
  // Past the last page (a bookmark, products deleted): back to the last one.
  if (query.page > pages) redirect(hrefFor(query, { page: pages }))
  const rows = list.rows.map((r) => row(r, now))
  const empty = query.q ? `No product matches “${query.q}”` : query.filter === 'low' ? 'No products are low on stock' : query.filter === 'all' ? 'Every product is archived' : `No ${FILTERS.find(([k]) => k === query.filter)![1].toLowerCase()} products`
  return (
    <>
      <PageHeader title="Products" actions={<><Menu variant="ghost" items={[{ label: 'Add photos', href: '/console/products/photos' }, { label: 'HSN codes', href: '/console/products/tax' }, { label: 'Collections', href: '/console/collections' }]} />{importLink}{add}</>} />
      {/* Neel § Screens · Products (N1c): the tabs, then the search and Sort; the search answers as you type. */}
      <ViewTabs label="Filter products" scroll tabs={FILTERS.map(([k, label]) => ({ href: hrefFor(query, { filter: k }), label, current: query.filter === k, count: list.counts[k] }))} />
      <div className="my-3 flex flex-wrap items-center gap-2">
        <LiveSearchField path="/console/products" label="Search products" placeholder="Search name, SKU or tag" value={query.q}
          params={{ ...(query.filter !== 'all' ? { status: query.filter } : {}), ...(query.sort !== 'edited' ? { sort: query.sort } : {}) }} />
        <SortSelect value={query.sort} hrefs={{ edited: hrefFor(query, { sort: 'edited' }), name: hrefFor(query, { sort: 'name' }), stock: hrefFor(query, { sort: 'stock' }) }} />
      </div>
      {!rows.length ? <Panel title={empty} />
        : <ProductTable key={hrefFor(query, { page: query.page })} rows={rows} collections={cols} />}
      <div className="mt-3">
        <Pager first={(query.page - 1) * PRODUCTS_PAGE + 1} shown={rows.length} total={list.total}
          prevHref={query.page > 1 ? hrefFor(query, { page: query.page - 1 }) : undefined} nextHref={query.page < pages ? hrefFor(query, { page: query.page + 1 }) : undefined} />
      </div>
    </>
  )
}

/** What one row shows, worked out here: the browser gets words and numbers, never the variants' facts. */
function row(r: ProductListRow, now: Date): Row {
  const label = statusLabel(r.status as Status, r.publishAt ? new Date(r.publishAt) : null, now)
  const o = r.stock > 0 ? null : bestOffer(r.offers, now)
  const sizeAt = r.options.findIndex(isSizeOption)
  const sizes = sizeAt >= 0 ? r.optionValues[sizeAt]?.length ?? 0 : 0
  return {
    id: r.id, title: r.title, href: `/console/products/${r.handle}`, status: label,
    thumb: r.cover ? urlFor(r.cover.base, pick(r.cover.widths, 96)) : null,
    sub: [r.typeName, `edited ${sinceIN(r.updatedAt, now)}`].filter(Boolean).join(' · '),
    minPrice: r.minPrice, maxPrice: r.maxPrice, unpriced: r.unpriced,
    stock: r.stock > 0 ? r.stock : !o || !r.variantCount ? null : o.kind === 'preorder' ? 'Pre-order' : o.kind === 'made_to_order' ? 'Made to order' : 'Sold out',
    sizes: sizes ? `${sizes} size${sizes === 1 ? '' : 's'}` : r.variantCount > 1 ? `${r.variantCount} options` : 'One size',
    swatches: r.swatches,
  }
}
