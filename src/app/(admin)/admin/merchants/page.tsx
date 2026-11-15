import Link from 'next/link'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { Pager } from '@/components/data/pager'
import { SearchField } from '@/components/data/search-field'
import { Numeric } from '@/components/data/numeric'
import { Name } from '@/components/data/name'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { listMerchants, PAGE_SIZE } from '@/lib/admin/merchants'
import { openTrialIds, shopTrialsFor } from '@/lib/admin/trials'
import { todayItems } from '@/lib/admin/today'
import { ViewTabs } from '@/components/ui/view-tabs'
import { ActionForm } from '@/components/ui/action-form'
import { Submit } from '@/components/ui/submit'
import type { TodayItem } from '@/domains/admin/today'
import { resendOwnerLinkAction } from './[id]/actions'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { dateTimeIN, dayMonthIN } from '@/lib/format-date'

export const metadata = { title: 'Merchants' }

const VIEWS = [['needs', 'Needs you'], ['trial', 'In trial'], ['live', 'Live'], ['all', 'All']] as const
type View = (typeof VIEWS)[number][0]
/** A store's waiting item, as the Needs column says it (the same item Today shows). */
const NEED: Partial<Record<TodayItem['kind'], (it: TodayItem) => string>> = {
  owner_waiting: () => 'Owner hasn\'t signed in',
  trial_ending: (it) => it.title.replace(/^.*?'s trial /, 'Trial ').replace(/\. No autopay yet\.$/, ' · no autopay'),
}

/** Admin › Merchants (Neel N4, board Merchants): a list that leads with what needs you. */
export default async function MerchantsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; view?: string }> }) {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page) || 1)
  const now = new Date()
  const [{ items }, inTrial] = await Promise.all([todayItems(staff), openTrialIds(staff)])
  const needs = new Map<string, TodayItem>()
  for (const it of items) if (it.tenantId && NEED[it.kind] && !needs.has(it.tenantId)) needs.set(it.tenantId, it)
  const views: Record<View, (id: string) => boolean> = { needs: (id) => needs.has(id), trial: (id) => inTrial.has(id), live: (id) => !inTrial.has(id), all: () => true }
  // Needs you first when something waits; All when nothing does (a search looks everywhere).
  const asked = VIEWS.find(([k]) => k === sp.view)?.[0]
  const view: View = asked ?? (sp.q ? 'all' : needs.size ? 'needs' : 'all')
  const { rows, total, counts } = await listMerchants(staff, { page, q: sp.q?.trim() || undefined, now, views, view })
  const qs = (extra: Record<string, string | number | undefined>) => { const u = new URLSearchParams(); for (const [k, v] of Object.entries({ view, q: sp.q, ...extra })) if (v !== undefined && v !== '') u.set(k, String(v)); return `?${u}` }
  // Trials TR0·4: each shop's trial, derived (src/domains/plans/trial.ts); a shop without a trial row has none.
  const trials = await shopTrialsFor(staff, rows.map((r) => r.id), now)
  const TRIAL: Record<string, string> = { building: 'Trial · not live yet', trial: 'Trial', ending: 'Trial ending', grace: 'Trial ended · grace', paused: 'Paused · no autopay', paid: '' }
  const pages = Math.ceil(total / PAGE_SIZE)

  return (
    <>
      <PageHeader title="Merchants" actions={<Link href="/admin/merchants/new" className={button()}>Add merchant</Link>} />
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1"><ViewTabs label="Views" tabs={VIEWS.map(([k, label]) => ({ href: `/admin/merchants${qs({ view: k, page: undefined })}`, label, count: counts[k], current: view === k }))} /></div>
        <SearchField label="Find a merchant" placeholder="Brand or address" value={sp.q} clearHref={`/admin/merchants?view=${view}`} hidden={{ view }} />
      </div>
      {rows.length === 0 ? (
        // A search that finds nothing says so, and offers the way back, never "Add the first merchant" (rule 18).
        sp.q
          ? <Panel title="No merchant matches that search" action={<Link href={`/admin/merchants?view=${view}`} className={button({ variant: 'secondary' })}>Clear search</Link>} />
          : view === 'needs' ? <Panel title="Nothing waits." />
          : view === 'all' ? <Panel title="No merchants yet" action={<Link href="/admin/merchants/new" className={button()}>Add the first merchant</Link>} />
          : <Panel title={view === 'trial' ? 'No store is in a trial.' : 'No store is live yet.'} />
      ) : (
        <DataTable label="Merchants">
          <DataTableHead>
            <th>Merchant</th><th>Needs</th><th>Plan</th><th className="text-right">Delivered this month</th><th><span className="sr-only">Action</span></th>
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
                <Td cell="c">{(() => { const it = needs.get(m.id); return it ? <Badge tone="warn">{NEED[it.kind]!(it)}</Badge> : null })()}</Td>
                <Td cell="d">
                  {m.plan ? <Badge tone="info">{m.plan.name}</Badge> : <Badge tone="danger">No plan</Badge>}
                  {(() => {
                    const t = trials.get(m.id)
                    if (t) return TRIAL[t.state] ? <div className={`whitespace-nowrap text-xs ${t.state === 'paused' || t.state === 'grace' ? 'text-danger-text' : 'text-warn-text'}`}>{TRIAL[t.state]}{t.state === 'trial' || t.state === 'ending' ? ` · ${t.daysLeft} days left` : ''}</div> : null
                    return m.plan?.trialEndsAt && m.plan.trialEndsAt > now ? <div className="whitespace-nowrap text-xs text-warn-text">Trial until {dayMonthIN(m.plan.trialEndsAt)}</div> : null
                  })()}
                </Td>
                <Td cell="b" className="text-right">
                  {m.ordersThisMonth === null ? <span className="hidden text-muted-foreground md:inline" title="Not drafted yet">—</span> : <span title={m.countedAt ? `Counted ${dateTimeIN(m.countedAt)}` : undefined}><Numeric>{m.ordersThisMonth.toLocaleString('en-IN')}</Numeric><span className="text-xs text-muted-foreground md:hidden"> delivered</span></span>}
                  {m.over && <div className="text-xs text-warn-text">Over the plan&apos;s {m.plan?.includedOrders.toLocaleString('en-IN')}</div>}
                </Td>
                <Td cell="e" className="md:text-right">{(() => {
                  const it = needs.get(m.id)
                  if (it?.kind === 'owner_waiting') return <ActionForm action={resendOwnerLinkAction}><input type="hidden" name="tenantId" value={m.id} /><Submit variant="secondary">Resend sign-in link</Submit></ActionForm>
                  if (it) return <Link href={it.href} prefetch={false} className={button({ variant: 'secondary' })}>Open {m.name}</Link>
                  return <Link href={`/admin/merchants/${m.id}/support`} className="inline-flex min-h-6 items-center whitespace-nowrap text-sm underline-offset-2 hover:underline">Open console</Link>
                })()}</Td>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}
      {rows.length > 0 && <Pager first={(page - 1) * PAGE_SIZE + 1} shown={rows.length} total={total}
        prevHref={page > 1 ? qs({ page: page - 1 }) : undefined}
        nextHref={page < pages ? qs({ page: page + 1 }) : undefined} />}
    </>
  )
}
