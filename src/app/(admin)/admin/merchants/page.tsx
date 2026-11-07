import Link from 'next/link'
import { DataTable, DataTableHead, DataTableRow } from '@/components/data/data-table'
import { Numeric } from '@/components/data/numeric'
import { Name } from '@/components/data/name'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { listMerchants, PAGE_SIZE } from '@/lib/admin/merchants'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { dayMonthIN, sinceIN } from '@/lib/format-date'

export default async function MerchantsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page) || 1)
  const { rows, total } = await listMerchants(staff, { page, q: sp.q?.trim() || undefined, now: new Date() })
  const pages = Math.ceil(total / PAGE_SIZE)

  return (
    <>
      <PageHeader title="Merchants" actions={<Link href="/admin/merchants/new" className={button()}>Add merchant</Link>} />
      <form className="flex flex-wrap items-center gap-2">
        <label htmlFor="q" className="sr-only">Search merchants</label>
        <input id="q" name="q" defaultValue={sp.q} placeholder="Search by brand or shop address"
          className="h-10 md:h-9 min-w-64 flex-1 rounded-md border border-input bg-card px-3 text-sm" />
        <span className="text-sm text-muted-foreground"><Numeric>{total}</Numeric> merchants</span>
      </form>
      {rows.length === 0 ? (
        <Panel title={sp.q ? 'No merchant matches that search' : 'No merchants yet'}
          action={<Link href="/admin/merchants/new" className={button()}>Add the first merchant</Link>} />
      ) : (
        <DataTable>
          <DataTableHead>
            <th>Merchant</th><th>Plan</th><th>Owner</th><th className="text-right">Orders this month</th><th></th>
          </DataTableHead>
          <tbody>
            {rows.map((m) => (
              <DataTableRow key={m.id}>
                <td>
                  <div className="flex items-center gap-2">
                    <Link href={`/admin/merchants/${m.id}`} className="font-medium hover:underline"><Name>{m.name}</Name></Link>
                    {m.isInternal && <Badge>Internal</Badge>}
                  </div>
                  {m.host && <div className="font-mono text-xs text-muted-foreground">{m.host}</div>}
                </td>
                <td>
                  {m.plan ? <Badge tone="info">{m.plan.name}</Badge> : <Badge tone="danger">No plan</Badge>}
                  {m.plan?.trialEndsAt && m.plan.trialEndsAt > new Date() && <div className="text-xs text-warn-text">Trial until {dayMonthIN(m.plan.trialEndsAt)}</div>}
                </td>
                <td className="text-sm">
                  {m.owner ? (m.owner.lastSignInAt ? <span className="text-muted-foreground">Signed in {sinceIN(m.owner.lastSignInAt)}</span> : <span className="text-warn-text">Never signed in</span>)
                    : m.pendingInvite ? <span className="text-warn-text">Owner not signed in yet</span> : <span className="text-muted-foreground">No owner</span>}
                </td>
                <td className="text-right">
                  <Numeric>{m.ordersThisMonth}</Numeric>
                  {m.over && <div className="text-xs text-warn-text">Over the plan&apos;s {m.plan?.includedOrders}</div>}
                </td>
                <td className="text-right"><Link href={`/admin/merchants/${m.id}/support`} className="text-sm hover:underline">Open console</Link></td>
              </DataTableRow>
            ))}
          </tbody>
        </DataTable>
      )}
      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground"><Numeric>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)}</Numeric> of <Numeric>{total}</Numeric></span>
          {page > 1 && <Link href={`?page=${page - 1}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ''}`}>Previous</Link>}
          {page < pages && <Link href={`?page=${page + 1}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ''}`}>Next</Link>}
        </nav>
      )}
    </>
  )
}
