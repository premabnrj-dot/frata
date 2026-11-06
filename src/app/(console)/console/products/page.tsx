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
import { listProducts } from '@/lib/queries/catalogue'

export const metadata = { title: 'Products · Frata' }

export default async function ProductsPage() {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  const rows = await listProducts(auth.membership.tenantId).catch((err) => { console.error('[products]', err instanceof Error ? err.name : err); return null })
  if (!rows) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  const add = <Link href="/console/products/new" className={button()}>Add product</Link>
  if (!rows.length) {
    return (
      <>
        <PageHeader title="Products" />
        <Panel title="No products yet" action={add}>Photos on a model, sizes and colours in one grid, and the size chart for its type. About 10 minutes for the first one.</Panel>
      </>
    )
  }
  return (
    <>
      <PageHeader title="Products" actions={add} />
      <DataTable>
        <DataTableHead><th className="w-14"><span className="sr-only">Photo</span></th><th>Product</th><th>Shown</th><th>Sizes and colours</th><th className="text-right">In stock</th><th className="text-right">Price</th></DataTableHead>
        <tbody>
          {rows.map((r) => (
            <DataTableRow key={r.id}>
              <td>{r.cover
                ? <img src={urlFor(r.cover.base, pick(r.cover.widths, 96))} alt="" width={40} height={50} loading="lazy" className="h-[50px] w-10 rounded-sm object-cover" />
                : <span className="block h-[50px] w-10 rounded-sm bg-muted" aria-hidden="true" />}</td>
              <td><Link href={`/console/products/${r.id}`} className="font-medium hover:underline">{r.title}</Link>{r.typeName && <span className="block text-xs text-muted-foreground">{r.typeName}</span>}</td>
              <td><Badge tone={r.publishedAt ? 'ok' : 'neutral'}>{r.publishedAt ? 'On your shop' : 'Hidden'}</Badge></td>
              <td><Numeric>{r.variantCount}</Numeric></td>
              <td className="text-right">{r.stock > 0 ? <Numeric>{r.stock}</Numeric> : <Badge tone="warn">Sold out</Badge>}</td>
              <td className="text-right">{r.minPrice === null || r.minPrice === 0 ? <span className="text-muted-foreground">No price</span>
                : r.minPrice === r.maxPrice ? <Money paise={paise(r.minPrice)} /> : <><Money paise={paise(r.minPrice)} />–<Money paise={paise(r.maxPrice!)} /></>}</td>
            </DataTableRow>
          ))}
        </tbody>
      </DataTable>
    </>
  )
}
