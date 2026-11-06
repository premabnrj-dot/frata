import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { DataTable, DataTableHead, DataTableRow } from '@/components/data/data-table'
import { Money, Numeric } from '@/components/data/numeric'
import { Badge } from '@/components/ui/badge'
import { button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { paise } from '@/domains/money/paise'
import { pick, urlFor } from '@/domains/media/sizes'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { listProducts, statusCounts } from '@/lib/queries/catalogue'
import { StatusBadge } from './_components/status-badge'

export const metadata = { title: 'Products · Frata' }

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
      <nav aria-label="Filter by status" className="mb-3 flex gap-1 overflow-x-auto text-sm">
        {TABS.map(([k, label]) => {
          const n = k ? counts[k] ?? 0 : total - (counts.archived ?? 0)
          const on = (status ?? '') === k
          return <Link key={k} href={k ? `/console/products?status=${k}` : '/console/products'} aria-current={on ? 'page' : undefined}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 transition-colors duration-fast ${on ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-accent'}`}>{label} <span className="font-mono text-xs">{n}</span></Link>
        })}
      </nav>
      {!rows.length ? <Panel title={`No ${TABS.find(([k]) => k === status)?.[1].toLowerCase() ?? ''} products`}>Products show here when you set them to this status.</Panel> : <DataTable>
        <DataTableHead><th className="w-14"><span className="sr-only">Photo</span></th><th>Product</th><th>Status</th><th>Sizes and colours</th><th className="text-right">In stock</th><th className="text-right">Price</th></DataTableHead>
        <tbody>
          {rows.map((r) => (
            <DataTableRow key={r.id}>
              <td>{r.cover
                ? <img src={urlFor(r.cover.base, pick(r.cover.widths, 96))} alt="" width={40} height={50} loading="lazy" className="h-[50px] w-10 rounded-sm object-cover" />
                : <span className="block h-[50px] w-10 rounded-sm bg-muted" aria-hidden="true" />}</td>
              <td><Link href={`/console/products/${r.handle}`} className="font-medium hover:underline">{r.title}</Link>{r.typeName && <span className="block text-xs text-muted-foreground">{r.typeName}</span>}</td>
              <td><StatusBadge status={r.status} publishAt={r.publishAt} /></td>
              <td><Numeric>{r.variantCount}</Numeric></td>
              <td className="text-right">{r.stock > 0 ? <Numeric>{r.stock}</Numeric> : <Badge tone="warn">Sold out</Badge>}</td>
              <td className="text-right">{r.minPrice === null || r.minPrice === 0 ? <span className="text-muted-foreground">No price</span>
                : r.minPrice === r.maxPrice ? <Money paise={paise(r.minPrice)} /> : <><Money paise={paise(r.minPrice)} />–<Money paise={paise(r.maxPrice!)} /></>}</td>
            </DataTableRow>
          ))}
        </tbody>
      </DataTable>}
    </>
  )
}
