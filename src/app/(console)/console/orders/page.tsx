import Link from 'next/link'
import { DataTable, DataTableHead, DataTableRow } from '@/components/data/data-table'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { paise } from '@/domains/money/paise'
import { currentMethod, orderState, paidAfterSwitch, type OrderState } from '@/domains/orders/order-state'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { dateTimeIN } from '@/lib/format-date'
import { Money, Numeric } from '@/components/data/numeric'
import { Name } from '@/components/data/name'
import { listOrders, ORDERS_PAGE, orderPrefixFor, queueCounts } from '@/lib/queries/orders'

const STATE: Record<OrderState, { label: string; tone: 'ok' | 'warn' | 'danger' | 'info' | 'neutral' }> = {
  awaiting_payment: { label: 'Paying now', tone: 'neutral' },
  payment_abandoned: { label: 'Payment abandoned', tone: 'neutral' },
  paid: { label: 'Ready to pack', tone: 'info' },
  unconfirmed: { label: 'To confirm', tone: 'warn' },
  held: { label: 'On hold', tone: 'warn' },
  refund_due: { label: 'Refund due', tone: 'danger' },
  packed: { label: 'Packed', tone: 'info' },
  confirmed: { label: 'Confirmed', tone: 'info' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  shipped: { label: 'Shipped', tone: 'info' },
  ndr: { label: 'Delivery failed', tone: 'danger' },
  delivered: { label: 'Delivered', tone: 'ok' },
  rto: { label: 'Returning', tone: 'danger' },
  rto_received: { label: 'Returned', tone: 'neutral' },
}

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ show?: string; page?: string }> }) {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return <Panel title={auth.message} />
  const sp = await searchParams
  // Unpaid online orders are not orders yet: listed only when asked for (they never count as "To confirm").
  const showUnpaid = sp.show === 'unpaid'
  const tab = showUnpaid ? 'not_paid' : 'all'
  const now = new Date()
  const tenantId = auth.membership.tenantId
  const counts = await queueCounts(tenantId, now).catch((err) => { console.error('[orders]', err instanceof Error ? err.name : err); return null })
  if (!counts) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  const total = counts[tab]
  const pages = Math.max(1, Math.ceil(total / ORDERS_PAGE))
  const asked = Number(sp.page)
  const page = Number.isSafeInteger(asked) ? Math.min(Math.max(1, asked), pages) : 1
  const list = await listOrders(tenantId, { tab, page, now }).catch((err) => { console.error('[orders]', err instanceof Error ? err.name : err); return null })
  if (!list) return <Panel title="We could not load this screen">Nothing was changed. Try again in a minute.</Panel>
  const rows = list.map((o) => ({ o, state: orderState(o, now) }))
  const first = (page - 1) * ORDERS_PAGE + 1
  const at = (p: number) => `/console/orders${showUnpaid || p > 1 ? `?${new URLSearchParams({ ...(showUnpaid ? { show: 'unpaid' } : {}), ...(p > 1 ? { page: String(p) } : {}) })}` : ''}`
  const prefix = await orderPrefixFor(tenantId)
  const pager = pages > 1 && rows.length > 0 && (
    <nav aria-label="Pages" className="mt-3 flex items-center gap-3 text-sm">
      <span className="text-muted-foreground">Showing <Numeric>{first.toLocaleString('en-IN')}–{(first + rows.length - 1).toLocaleString('en-IN')}</Numeric> of <Numeric>{total.toLocaleString('en-IN')}</Numeric>, newest first</span>
      {page > 1 && <Link href={at(page - 1)} className="underline">Newer</Link>}
      {page < pages && <Link href={at(page + 1)} className="underline">Older</Link>}
    </nav>
  )
  return (
    <>
      <PageHeader title="Orders" />
      <p className="-mt-2 mb-3 text-sm text-muted-foreground">
        {counts.to_confirm ? <><Numeric>{counts.to_confirm.toLocaleString('en-IN')}</Numeric> to confirm. </> : null}
        {showUnpaid ? <Link href="/console/orders" className="underline">Back to orders</Link>
          : counts.not_paid ? <Link href="/console/orders?show=unpaid" className="underline"><Numeric>{counts.not_paid.toLocaleString('en-IN')}</Numeric> online order{counts.not_paid === 1 ? '' : 's'} not paid</Link> : null}
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
                  <td>{o.customerName ? <Name>{o.customerName}</Name> : '—'}<span className="block text-xs text-muted-foreground">{[o.city, `${o.items} item${o.items === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</span></td>
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
      {pager}
    </>
  )
}
