import { DataTable, DataTableHead, DataTableRow } from '@/components/data/data-table'
import { PageHeader } from '@/components/layout/page-header'
import { Panel } from '@/components/ui/panel'
import { listActivity } from '@/lib/admin/activity'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { dateTimeIN } from '@/lib/format-date'

export default async function ActivityPage() {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const rows = await listActivity(staff)
  return (
    <>
      <PageHeader title="Activity" />
      {rows.length === 0 ? <Panel title="Nothing recorded yet" /> : (
        <DataTable>
          <DataTableHead><th>When</th><th>Who</th><th>Store</th><th>What</th></DataTableHead>
          <tbody>
            {rows.map(({ e, store }) => (
              <DataTableRow key={e.id}>
                <td className="whitespace-nowrap text-muted-foreground">{dateTimeIN(e.at)}</td>
                <td>{e.actorEmail ?? e.actorUserId}{e.actorKind === 'support' && <span className="text-muted-foreground"> · support visit</span>}</td>
                <td>{store ?? '—'}</td>
                <td><span className="font-mono text-xs">{e.action}</span>{e.target && <span> · {e.target}</span>}</td>
              </DataTableRow>
            ))}
          </tbody>
        </DataTable>
      )}
    </>
  )
}
