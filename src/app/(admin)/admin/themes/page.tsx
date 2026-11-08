import Link from 'next/link'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { PageHeader } from '@/components/layout/page-header'
import { Panel } from '@/components/ui/panel'
import { themeVersionsForAdmin } from '@/lib/admin/themes'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { StateBadge } from './state-badge'

export const metadata = { title: 'Themes' }

/** Admin › Themes (themes T3; mockup "Admin › Themes"): every version in the deployed code, its state and its shops. */
export default async function ThemesPage() {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const versions = await themeVersionsForAdmin(staff)
  const fresh = versions.filter((v) => v.state === 'deployed')
  return (
    <>
      <PageHeader title="Themes" meta="Code ships a theme version; you decide who may use it. Recall and withdraw are final: the fix for a bad version is a new version." />
      {fresh.length > 0
        ? <p role="status" className="mb-3 rounded-md bg-info px-3 py-2 text-sm text-info-text">New in this deploy: {fresh.map((v) => `${v.name} ${v.version}`).join(', ')}. Stage it to a few shops, then release it.</p>
        : <p className="mb-3 text-sm text-muted-foreground">Nothing new in this deploy.</p>}
      <DataTable label="Theme versions">
        <DataTableHead><th>Theme</th><th>Version</th><th>State</th><th className="text-right">Shops live on it</th><th>Staged to</th></DataTableHead>
        <DataTableBody>
          {versions.map((v) => (
            <DataTableRow key={`${v.key}@${v.version}`} dimmed={!v.inCode}>
              <Td cell="a" className="font-medium"><Link href={`/admin/themes/${v.key}/${v.version}`} className="underline-offset-4 hover:underline">{v.name}</Link></Td>
              <Td cell="b" className="font-mono">{v.version}</Td>
              <Td cell="c"><StateBadge state={v.state} /></Td>
              <Td cell="d" className="text-right tabular-nums">{v.live}</Td>
              <Td cell="e" className="text-muted-foreground">{v.staged.length ? `${v.staged.length} shop${v.staged.length === 1 ? '' : 's'}` : '—'}</Td>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </>
  )
}
