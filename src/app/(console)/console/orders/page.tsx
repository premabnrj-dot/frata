import Link from 'next/link'
import { DataTable, DataTableHead, DataTableRow } from '@/components/data/data-table'
import { Money } from '@/components/data/numeric'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { paise } from '@/domains/money/paise'
import { currentMethod, isReal, orderState, paidAfterSwitch, type OrderState } from '@/domains/orders/order-state'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { dateTimeIN } from '@/lib/format-date'
import { listOrders, orderPrefixFor } from '@/lib/queries/orders'

const STATE: Record<OrderState, { label: string; tone: 'ok' | 'warn' | 'danger' | 'info' | 'neutral' }> = {
  awaiting_payment: { label: 'Paying now', tone: 'neutral' },
  payment_abandoned: { label: 'Payment abandoned', tone: 'neutral' },
  paid: { label: 'Ready to pack', tone: 'info' },
  unconfirmed: { label: 'To confirm', tone: 'warn' },
  confirmed: { label: 'Confirmed', tone: 'info' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  shipped: { label: 'Shipped', tone: 'info' },
  ndr: { label: 'Delivery failed', tone: 'danger' },
  delivered: { label: 'Delivered', tone: 'ok' },
  rto: { label: 'Returning', tone: 'danger' },
  rto_received: { label: 'Returned', tone: 'neutral' },
}

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  const all = await listOrders(auth.membership.tenantId).catch((err) => { console.error('[orders]', err instanceof Error ? err.name : err); return null })
  if (!all) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  const now = new Date()
  const withState = all.map((o) => ({ o, state: orderState(o, now) }))
  const unpaid = withState.filter((x) => !isReal(x.state))
  // Unpaid online orders are not orders yet: listed only when asked for (they never count as "To confirm").
  const showUnpaid = (await searchParams).show === 'unpaid'
  const rows = showUnpaid ? unpaid : withState.filter((x) => isReal(x.state))
  const toConfirm = withState.filter((x) => x.state === 'unconfirmed').length
  const prefix = await orderPrefixFor(auth.membership.tenantId)
  return (
    <>
      <PageHeader title="Orders" />
      <p className="-mt-2 mb-3 text-sm text-muted-foreground">
        {toConfirm ? <><span className="font-mono">{toConfirm}</span> to confirm. </> : null}
        {showUnpaid ? <Link href="/console/orders" className="underline">Back to orders</Link>
          : unpaid.length ? <Link href="/console/orders?show=unpaid" className="underline">{unpaid.length} online order{unpaid.length === 1 ? '' : 's'} not paid</Link> : null}
      </p>
      {rows.length === 0 ? (
        <Panel title={showUnpaid ? 'No unpaid online orders' : 'No orders yet'}>{showUnpaid ? 'Online orders that were never paid show here; they hold stock for 20 minutes, then let it go.' : 'Orders from your shop appear here as they are placed. Pay on delivery orders wait for you to confirm them.'}</Panel>
      ) : (
        <DataTable>
          <DataTableHead>
            <th>Order</th><th>Customer</th><th>Placed</th><th>Payment</th><th>Status</th><th className="text-right">Total</th>
          </DataTableHead>
          <tbody>
            {rows.map(({ o, state }) => {
              const s = STATE[state]
              const method = currentMethod(o)
              return (
                <DataTableRow key={o.id} dimmed={s.tone === 'neutral'}>
                  <td className="font-mono">{prefix}-{o.number}</td>
                  <td>{o.customerName || '—'}<span className="block text-xs text-muted-foreground">{[o.city, `${o.items} item${o.items === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</span></td>
                  <td className="whitespace-nowrap text-muted-foreground">{dateTimeIN(o.placedAt)}</td>
                  <td>{method === 'cod' ? 'Pay on delivery' : o.paidAt ? 'Paid online' : 'Online, not paid'}
                    {paidAfterSwitch(o) && <Badge tone="danger" className="ml-1.5">Do not collect cash</Badge>}</td>
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
