import Link from 'next/link'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { Money, Numeric } from '@/components/data/numeric'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { paise } from '@/domains/money/paise'
import { offerTotalsForAdmin } from '@/lib/admin/offers'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'

export const metadata = { title: 'Offers' }

const DAYS = 30

/** Admin › Offers (offers O·4; Neel N4 board Reference › Offers): every store's offers in total, by ₹ given; a store opens its offers. */
export default async function AdminOffersPage() {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const now = new Date()
  const shops = await offerTotalsForAdmin(staff, now, new Date(now.getTime() - DAYS * 86_400_000))
  return (
    <>
      <PageHeader title="Offers" meta={`Last ${DAYS} days`} />
      {!shops.length ? <Panel title="No offers yet" /> : (
        <DataTable label="Stores by ₹ given">
          <DataTableHead><th>Store</th><th className="text-right">Live offers</th><th className="text-right">Orders with an offer</th><th className="text-right">₹ given</th></DataTableHead>
          <DataTableBody>
            {shops.map((s) => (
              <DataTableRow key={s.tenantId}>
                <Td cell="a" className="font-medium"><Link href={`/admin/offers/${s.tenantId}`} data-row-link className="underline-offset-4 hover:underline">{s.name}</Link>
                  {s.stopped ? <> <Badge tone="danger">{s.stopped} stopped</Badge></> : null}</Td>
                <Td cell="b" className="text-right"><span className="text-xs text-muted-foreground md:hidden">Live </span><Numeric>{s.live}</Numeric></Td>
                <Td cell="c" className="text-right"><span className="text-xs text-muted-foreground md:hidden">Orders </span><Numeric>{s.orders}</Numeric></Td>
                <Td cell="d" className="text-right"><span className="text-xs text-muted-foreground md:hidden">Given </span><Money paise={paise(s.given)} /></Td>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}
    </>
  )
}
