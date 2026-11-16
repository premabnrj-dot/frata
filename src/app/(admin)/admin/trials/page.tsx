import Link from 'next/link'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { ViewTabs } from '@/components/ui/view-tabs'
import { trialList, type TrialRow } from '@/lib/admin/trials'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { dayMonthIN } from '@/lib/format-date'

export const metadata = { title: 'Trials' }
export const dynamic = 'force-dynamic'

const VIEWS = [['needs', 'Needs you'], ['trial', 'In trial'], ['ended', 'Ended']] as const
type View = (typeof VIEWS)[number][0]
/** Needs you: the same rule as Today's trial item (ending or in grace, no autopay, 3 days or fewer). */
const IN: Record<View, (r: TrialRow) => boolean> = {
  needs: (r) => (r.state === 'ending' || r.state === 'grace') && !r.autopay && r.daysLeft <= 3,
  trial: (r) => r.state === 'building' || r.state === 'trial' || r.state === 'ending' || r.state === 'grace',
  ended: (r) => r.state === 'paused' || r.state === 'paid',
}
const TONE = { building: 'neutral', trial: 'ok', ending: 'warn', grace: 'danger', paused: 'danger', paid: 'neutral' } as const

function when(r: TrialRow) {
  if (r.state === 'building') return 'Not live yet'
  if (r.state === 'paid') return `Ended ${dayMonthIN(r.lastDay)}`
  if (r.state === 'paused') return `Paused since ${dayMonthIN(r.lastDay)}`
  if (r.state === 'grace') return `Ended ${dayMonthIN(r.lastDay)} · in grace`
  return r.daysLeft <= 0 ? 'Ends today' : `Ends in ${r.daysLeft} ${r.daysLeft === 1 ? 'day' : 'days'}`
}

/** Admin › Trials (Neel N4, board Reference › Trials): ending soonest first; a row opens the store's Plan tab. */
export default async function TrialsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const [sp, rows] = await Promise.all([searchParams, trialList(staff, new Date())])
  const counts = Object.fromEntries(VIEWS.map(([k]) => [k, rows.filter(IN[k]).length])) as Record<View, number>
  const view: View = VIEWS.find(([k]) => k === sp.view)?.[0] ?? (counts.needs ? 'needs' : 'trial')
  const shown = rows.filter(IN[view])
  return (
    <>
      <PageHeader title="Trials" />
      <ViewTabs label="Views" tabs={VIEWS.map(([k, label]) => ({ href: `/admin/trials?view=${k}`, label, count: k === 'ended' ? undefined : counts[k], current: view === k }))} />
      {shown.length === 0 ? <Panel title={view === 'needs' ? 'Nothing waits.' : view === 'trial' ? 'No store is in a trial' : 'No trial has ended'} /> : (
        <DataTable label="Trials">
          <DataTableHead><th>Store</th><th>Trial</th><th>Autopay</th></DataTableHead>
          <DataTableBody>
            {shown.map((r) => (
              <DataTableRow key={r.tenantId}>
                <Td cell="a"><Link href={`/admin/merchants/${r.tenantId}/plan#trial`} data-row-link prefetch={false} className="font-medium hover:underline">{r.name}</Link></Td>
                <Td cell="c"><Badge tone={TONE[r.state]}>{when(r)}</Badge></Td>
                <Td cell="d">{r.autopay ? <span className="text-muted-foreground">On</span> : <Badge tone="warn">No autopay</Badge>}</Td>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}
    </>
  )
}
