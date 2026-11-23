import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { button } from '@/components/ui/button'
import { Empty } from '@/components/ui/empty'
import { Panel } from '@/components/ui/panel'
import { ViewTabs } from '@/components/ui/view-tabs'
import { istDayKey } from '@/domains/time/day'
import { monthKey } from '@/domains/time/month'
import { cashOverview, movementsOf } from '@/lib/admin/cash'
import { ADMIN_ONLY, requireStaff } from '@/lib/auth/require-staff'
import { AccountsView } from './_components/accounts-view'
import { AddAccountButton, AddEntryButton, UpdateBalanceButton } from './_components/forms'
import { MovementsView } from './_components/movements-view'
import { Overview } from './_components/overview'

export const metadata = { title: 'Cashflow' }
export const dynamic = 'force-dynamic'

const VIEWS = [['overview', 'Overview'], ['movements', 'Movements'], ['accounts', 'Accounts']] as const
type View = (typeof VIEWS)[number][0]
const KINDS = ['all', 'in', 'out', 'entered'] as const

/** Admin › Cashflow (spec docs/specs/2026-11-23-admin-cashflow.md; mockup docs/mockups/2026-11-23-admin-cashflow.html): cash in the bank, money in and out. */
export default async function CashflowPage({ searchParams }: { searchParams: Promise<{ view?: string; ym?: string; kind?: string }> }) {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) {
    return staff.reason === 'not_staff'
      ? <><PageHeader title="Cashflow" /><Empty picto="shield" title="Only a master admin can open Cashflow"><Link href="/admin" className={button({ variant: 'secondary' })}>Back to Today</Link></Empty></>
      : <Panel title={staff.message} />
  }
  const sp = await searchParams
  const today = istDayKey(new Date())
  const view: View = VIEWS.find(([k]) => k === sp.view)?.[0] ?? 'overview'
  const o = await cashOverview(staff, today)
  const options = o.accounts.map((a) => ({ id: a.id, name: a.name, main: a.main, latestPaise: a.latest?.paise ?? null }))
  const header = (
    <PageHeader title="Cashflow" actions={<>
      {view === 'accounts' ? <AddAccountButton /> : <AddEntryButton accounts={options} today={today} />}
      <UpdateBalanceButton accounts={options} floor={o.floor} today={o.today} />
    </>} />
  )
  const tabs = <ViewTabs label="Cashflow" tabs={VIEWS.map(([k, l]) => ({ href: `/admin/cashflow?view=${k}`, label: l, current: view === k }))} />
  if (view === 'movements') {
    const months = Array.from({ length: 6 }, (_, i) => monthKey(today, -i))
    const ym = months.includes(sp.ym ?? '') ? sp.ym! : months[0]!
    const kind = (KINDS as readonly string[]).includes(sp.kind ?? '') ? (sp.kind as (typeof KINDS)[number]) : 'all'
    const mv = await movementsOf(staff, ym)
    return <>{header}{tabs}<MovementsView mv={mv} today={today} kind={kind} /></>
  }
  if (view === 'accounts') return <>{header}{tabs}<AccountsView o={o} /></>
  return <>{header}{tabs}<Overview o={o} /></>
}
