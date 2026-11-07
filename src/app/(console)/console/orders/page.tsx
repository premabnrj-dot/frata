import Link from 'next/link'
import { DataTable, DataTableHead, DataTableRow } from '@/components/data/data-table'
import { Money, Numeric } from '@/components/data/numeric'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { paise } from '@/domains/money/paise'
import { orderState, type OrderState } from '@/domains/orders/order-state'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { dateTimeIN } from '@/lib/format-date'
import { listOrders } from '@/lib/queries/orders'

const STATE: Record<OrderState, { label: string; tone: 'ok' | 'warn' | 'danger' | 'info' | 'neutral' }> = {
  unconfirmed: { label: 'To confirm', tone: 'warn' },
  confirmed: { label: 'Confirmed', tone: 'info' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  shipped: { label: 'Shipped', tone: 'info' },
  ndr: { label: 'Delivery failed', tone: 'danger' },
  delivered: { label: 'Delivered', tone: 'ok' },
  rto: { label: 'Returning', tone: 'danger' },
  rto_received: { label: 'Returned', tone: 'neutral' },
}

export default async function OrdersPage() {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />

  const rows = await listOrders(auth.membership.tenantId)
  return (
    <>
      <PageHeader title="Orders" />
      {rows.length === 0 ? (
        <Panel title="No orders yet">Orders from your store, WhatsApp and Instagram will be listed here.</Panel>
      ) : (
        <DataTable>
          <DataTableHead>
            <th>Order</th><th>Placed</th><th>Payment</th><th>Status</th><th className="text-right">Value</th>
          </DataTableHead>
          <tbody>
            {rows.map((o) => {
              const s = STATE[orderState(o)]
              return (
                <DataTableRow key={o.id} dimmed={s.tone === 'neutral'}>
                  <td><Link href={`/console/orders/${o.number}`} className="hover:underline"><Numeric>#{o.number}</Numeric></Link></td>
                  <td className="whitespace-nowrap text-muted-foreground">{dateTimeIN(o.placedAt)}</td>
                  <td><Badge tone={o.paymentMethod === 'cod' ? 'warn' : 'neutral'}>{o.paymentMethod === 'cod' ? 'COD' : 'Prepaid'}</Badge></td>
                  <td><Badge tone={s.tone}>{s.label}</Badge></td>
                  <td className="text-right"><Money paise={paise(o.total)} /></td>
                </DataTableRow>
              )
            })}
          </tbody>
        </DataTable>
      )}
    </>
  )
}
