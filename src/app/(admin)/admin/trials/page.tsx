import Link from 'next/link'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { trialList } from '@/lib/admin/trials'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { dayMonthIN } from '@/lib/format-date'

export const metadata = { title: 'Trials' }
export const dynamic = 'force-dynamic'

const TONE = { building: 'neutral', trial: 'ok', ending: 'warn', grace: 'danger', paused: 'danger', paid: 'neutral' } as const
const LABEL = { building: 'Not live', trial: 'Trial', ending: 'Ending', grace: 'Grace', paused: 'Paused', paid: 'Ended' } as const

/** Admin › Trials (trials TR1·10): every shop's trial, ending soonest first. Extend or end on the shop's plan page. */
export default async function TrialsPage() {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const rows = await trialList(staff, new Date())
  return (
    <>
      <PageHeader title="Trials" />
      {rows.length === 0 ? <Panel title="No trials" /> : (
        <DataTable>
          <DataTableHead><th>Shop</th><th>State</th><th>Last day</th><th className="text-right">Days left</th><th>Autopay</th></DataTableHead>
          <DataTableBody>
            {rows.map((r) => (
              <DataTableRow key={r.tenantId}>
                <Td cell="a"><Link href={`/admin/merchants/${r.tenantId}/plan#trial`} data-row-link prefetch={false} className="font-medium hover:underline">{r.name}</Link></Td>
                <Td cell="b"><Badge tone={TONE[r.state]}>{LABEL[r.state]}</Badge></Td>
                <Td cell="c" className="whitespace-nowrap">{r.state === 'building' ? '—' : dayMonthIN(r.lastDay)}</Td>
                <Td cell="d" className="text-right font-num">{r.state === 'trial' || r.state === 'ending' ? r.daysLeft : '—'}</Td>
                <Td cell="e">{r.autopay ? 'Yes' : 'No'}</Td>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}
    </>
  )
}
