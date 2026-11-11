import Link from 'next/link'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { Pager } from '@/components/data/pager'
import { SearchField } from '@/components/data/search-field'
import { Numeric } from '@/components/data/numeric'
import { Name } from '@/components/data/name'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { Panel } from '@/components/ui/panel'
import { listMerchants, PAGE_SIZE } from '@/lib/admin/merchants'
import { shopTrialsFor } from '@/lib/admin/trials'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { dateTimeIN, dayMonthIN, sinceIN } from '@/lib/format-date'

export const metadata = { title: 'Merchants' }

export default async function MerchantsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; error?: string }> }) {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page) || 1)
  const now = new Date()
  const { rows, total } = await listMerchants(staff, { page, q: sp.q?.trim() || undefined, now })
  // Trials TR0·4: each shop's trial, derived (src/domains/plans/trial.ts); a shop without a trial row has none.
  const trials = await shopTrialsFor(staff, rows.map((r) => r.id), now)
  const TRIAL: Record<string, string> = { building: 'Trial · not live yet', trial: 'Trial', ending: 'Trial ending', grace: 'Trial ended · grace', paused: 'Paused · no autopay', paid: '' }
  const pages = Math.ceil(total / PAGE_SIZE)

  return (
    <>
      <PageHeader title="Merchants" actions={<Link href="/admin/merchants/new" className={button()}>Add merchant</Link>} />
      <Notice error={sp.error} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <SearchField label="Search merchants" placeholder="Search by brand or shop address" value={sp.q} clearHref="/admin/merchants" />
        <span className="text-sm text-muted-foreground"><Numeric>{total.toLocaleString('en-IN')}</Numeric> {sp.q ? 'found' : 'merchants'}</span>
      </div>
      {rows.length === 0 ? (
        // A search that finds nothing says so, and offers the way back, never "Add the first merchant" (rule 18).
        sp.q
          ? <Panel title="No merchant matches that search" action={<Link href="/admin/merchants" className={button({ variant: 'secondary' })}>Clear search</Link>}>Try a part of the brand name or the shop address.</Panel>
          : <Panel title="No merchants yet" action={<Link href="/admin/merchants/new" className={button()}>Add the first merchant</Link>} />
      ) : (
        <DataTable label="Merchants">
          <DataTableHead>
            <th>Merchant</th><th>Plan</th><th>Owner</th><th className="text-right">Delivered this month</th><th></th>
          </DataTableHead>
          <DataTableBody>
            {rows.map((m) => (
              <DataTableRow key={m.id}>
                <Td cell="a">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <Link href={`/admin/merchants/${m.id}`} data-row-link className="inline-flex min-h-6 min-w-6 items-center font-medium [overflow-wrap:anywhere] hover:underline"><Name>{m.name}</Name></Link>
                    {m.isInternal && <Badge>Internal</Badge>}
                  </div>
                  <div className="truncate font-mono text-xs text-muted-foreground">{m.host}</div>
                </Td>
                <Td cell="d">
                  {m.plan ? <Badge tone="info">{m.plan.name}</Badge> : <Badge tone="danger">No plan</Badge>}
                  {(() => {
                    const t = trials.get(m.id)
                    if (t) return TRIAL[t.state] ? <div className={`whitespace-nowrap text-xs ${t.state === 'paused' || t.state === 'grace' ? 'text-danger-text' : 'text-warn-text'}`}>{TRIAL[t.state]}{t.state === 'trial' || t.state === 'ending' ? ` · ${t.daysLeft} days left` : ''}</div> : null
                    return m.plan?.trialEndsAt && m.plan.trialEndsAt > now ? <div className="whitespace-nowrap text-xs text-warn-text">Trial until {dayMonthIN(m.plan.trialEndsAt)}</div> : null
                  })()}
                </Td>
                <Td cell="c" className="text-xs md:text-sm">
                  {m.owner ? (m.owner.lastSignInAt ? <span className="text-muted-foreground">Signed in {sinceIN(m.owner.lastSignInAt, new Date())}</span> : <span className="text-warn-text">Never signed in</span>)
                    : m.pendingInvite ? <span className="text-warn-text">Owner not signed in yet</span> : <span className="text-muted-foreground">No owner</span>}
                </Td>
                <Td cell="b" className="text-right">
                  {m.ordersThisMonth === null ? <span className="text-muted-foreground" title="Not drafted yet">—</span> : <span title={m.countedAt ? `Counted ${dateTimeIN(m.countedAt)}` : undefined}><Numeric>{m.ordersThisMonth.toLocaleString('en-IN')}</Numeric></span>}<span className="text-xs text-muted-foreground md:hidden"> delivered</span>
                  {m.over && <div className="text-xs text-warn-text">Over the plan&apos;s {m.plan?.includedOrders.toLocaleString('en-IN')}</div>}
                </Td>
                <Td cell="e" className="md:text-right"><Link href={`/admin/merchants/${m.id}/support`} className="inline-flex min-h-6 items-center whitespace-nowrap text-sm underline-offset-2 hover:underline">Open console</Link></Td>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}
      {rows.length > 0 && <Pager first={(page - 1) * PAGE_SIZE + 1} shown={rows.length} total={total}
        prevHref={page > 1 ? `?page=${page - 1}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ''}` : undefined}
        nextHref={page < pages ? `?page=${page + 1}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ''}` : undefined} />}
    </>
  )
}
