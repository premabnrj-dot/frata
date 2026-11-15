import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { PageHeader } from '@/components/layout/page-header'
import { ViewTabs } from '@/components/ui/view-tabs'
import { Panel } from '@/components/ui/panel'
import { Pager } from '@/components/data/pager'
import { LiveSearchField } from '@/components/data/live-search-field'
import { hrefFor, type ListFilter, type ListQuery } from '@/domains/catalogue/list-query'
import { PRODUCTS_PAGE, type ProductList } from '@/lib/queries/catalogue'
import { SortSelect } from './sort-select'
import type { Row } from './product-table'

export const FILTERS: [ListFilter, string][] = [['all', 'All'], ['active', 'Active'], ['draft', 'Draft'], ['unlisted', 'Unlisted'], ['archived', 'Archived'], ['low', 'Low stock']]

/** The products list's frame (products PR·1; Neel N1c): the tabs with counts, search, Sort, the table and the pager.
 *  The owner's page and a Builder's view-only page (T1c, approved mockup screen 7) both render it; only `actions` and
 *  `table` differ. */
export function ProductsListView({ list, query, rows, actions, emptyAction, table }: {
  list: ProductList; query: ListQuery; rows: Row[]; actions?: ReactNode; emptyAction?: ReactNode; table: ReactNode
}) {
  if (!list.counts.any) {
    return (
      <>
        <PageHeader title="Products" />
        <Panel title="No products yet" action={emptyAction} />
      </>
    )
  }
  const pages = Math.max(1, Math.ceil(list.total / PRODUCTS_PAGE))
  // Past the last page (a bookmark, products deleted): back to the last one.
  if (query.page > pages) redirect(hrefFor(query, { page: pages }))
  const empty = query.q ? `No product matches “${query.q}”` : query.filter === 'low' ? 'No products are low on stock' : query.filter === 'all' ? 'Every product is archived' : `No ${FILTERS.find(([k]) => k === query.filter)![1].toLowerCase()} products`
  return (
    <>
      <PageHeader title="Products" actions={actions} />
      {/* Neel § Screens · Products (N1c): the tabs, then the search and Sort; the search answers as you type. */}
      <ViewTabs label="Filter products" scroll tabs={FILTERS.map(([k, label]) => ({ href: hrefFor(query, { filter: k }), label, current: query.filter === k, count: list.counts[k] }))} />
      <div className="my-3 flex flex-wrap items-center gap-2">
        <LiveSearchField path="/console/products" label="Search products" placeholder="Search name, SKU or tag" value={query.q}
          params={{ ...(query.filter !== 'all' ? { status: query.filter } : {}), ...(query.sort !== 'edited' ? { sort: query.sort } : {}) }} />
        <SortSelect value={query.sort} hrefs={{ edited: hrefFor(query, { sort: 'edited' }), name: hrefFor(query, { sort: 'name' }), stock: hrefFor(query, { sort: 'stock' }) }} />
      </div>
      {!rows.length ? <Panel title={empty} /> : table}
      <div className="mt-3">
        <Pager first={(query.page - 1) * PRODUCTS_PAGE + 1} shown={rows.length} total={list.total}
          prevHref={query.page > 1 ? hrefFor(query, { page: query.page - 1 }) : undefined} nextHref={query.page < pages ? hrefFor(query, { page: query.page + 1 }) : undefined} />
      </div>
    </>
  )
}
