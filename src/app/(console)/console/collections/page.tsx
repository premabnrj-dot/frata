import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { Numeric } from '@/components/data/numeric'
import { Badge } from '@/components/ui/badge'
import { button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { listCollections } from '@/lib/queries/catalogue'

export const metadata = { title: 'Collections' }

export default async function CollectionsPage() {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  const rows = await listCollections(auth.membership.tenantId).catch((err) => { console.error('[collections]', err instanceof Error ? err.name : err); return null })
  if (!rows) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  const add = <><Link href="/console/collections/new?kind=auto" className={button({ variant: 'secondary' })}>Rule-based</Link><Link href="/console/collections/new" className={button()}>Add collection</Link></>
  return (
    <>
      <PageHeader title="Collections" back={{ href: '/console/products', label: 'Products' }} actions={add} />
      {!rows.length ? (
        <Panel title="No collections yet">Group products for your shop’s menus: hand-pick a Festive edit, or let rules fill one (Kurtas in chanderi under ₹2,000) so new products join by themselves.</Panel>
      ) : (
        <DataTable>
          <DataTableHead><th>Collection</th><th>Filled by</th><th className="text-right">Products</th></DataTableHead>
          <DataTableBody>
            {rows.map((r) => (
              <DataTableRow key={r.id}>
                <Td cell="a"><Link href={`/console/collections/${r.handle}`} data-row-link prefetch={false} className="font-medium hover:underline">{r.title}</Link><span className="block font-mono text-xs text-muted-foreground">/collections/{r.handle}</span></Td>
                <Td cell="d"><Badge tone={r.kind === 'auto' ? 'info' : 'neutral'}>{r.kind === 'auto' ? 'Rules' : 'Hand-picked'}</Badge></Td>
                <Td cell="b" className="text-right"><Numeric>{r.count}</Numeric></Td>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}
    </>
  )
}
