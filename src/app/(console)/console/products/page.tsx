import Link from 'next/link'
import { button } from '@/components/ui/button'
import { Menu } from '@/components/ui/menu'
import { Panel } from '@/components/ui/panel'
import { hrefFor, listQuery } from '@/domains/catalogue/list-query'
import { requireCapability } from '@/lib/auth/require-capability'
import { listProducts, manualCollections } from '@/lib/queries/catalogue'
import { ProductTable } from './_components/product-table'
import { ProductsListView } from './_components/products-list-view'
import { row } from './_components/rows'
import { BuilderProducts } from './_builder/products'

export const metadata = { title: 'Products' }

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // catalogue.read (T1c): a member who works the shop gets the list with its actions; a partner's Builder the same list,
  // view only, read as frata_builder in its own file. Every write below still asks asMember(ANY_MEMBER) itself.
  const cap = await requireCapability('catalogue.read')
  const now = new Date()
  if (!cap.ok) return <Panel title={cap.message} />
  const query = listQuery(await searchParams)
  if (cap.kind === 'builder') return <BuilderProducts actor={cap.actor} query={query} now={now} />
  const auth = cap.auth
  const tenantId = auth.membership.tenantId
  const [list, cols] = await Promise.all([listProducts(tenantId, query), manualCollections(tenantId)]).catch((err) => { console.error('[products]', err instanceof Error ? err.name : err); return [null, null] as const })
  if (!list || !cols) return <Panel title="We couldn’t load this screen">Nothing was changed. Try again in a minute.</Panel>
  const add = <Link href="/console/products/new" className={button()}>Add product</Link>
  const importLink = <Link href="/console/products/import" className={button({ variant: 'secondary' })}>Import</Link>
  const rows = list.rows.map((r) => row(r, now))
  return (
    <ProductsListView list={list} query={query} rows={rows}
      emptyAction={<span className="flex flex-wrap justify-center gap-2">{importLink}{add}</span>}
      actions={<><Menu variant="ghost" items={[{ label: 'Add photos', href: '/console/products/photos' }, { label: 'HSN codes', href: '/console/products/tax' }, { label: 'Collections', href: '/console/collections' }]} />{importLink}{add}</>}
      table={<ProductTable key={hrefFor(query, { page: query.page })} rows={rows} collections={cols} />} />
  )
}
