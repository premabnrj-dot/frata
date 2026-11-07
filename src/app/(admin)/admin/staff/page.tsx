import { DataTable, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { Panel } from '@/components/ui/panel'
import { listStaff } from '@/lib/admin/staff'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { dayIN } from '@/lib/format-date'
import { addStaffAction, removeStaffAction } from './actions'
import { Section } from '@/components/layout/section'

export const metadata = { title: 'Staff' }

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const rows = await listStaff(staff)
  const sp = await searchParams
  const isAdmin = staff.role === 'admin'
  return (
    <>
      <PageHeader title="Staff" />
      <Notice ok={sp.ok} error={sp.error} />
      <DataTable>
        <DataTableHead><th>Email</th><th>Role</th><th>Since</th><th></th></DataTableHead>
        <tbody>
          {rows.map((r) => (
            <DataTableRow key={r.userId}>
              <Td cell="a" className="font-mono">{r.email}</Td>
              <Td cell="d"><Badge tone={r.role === 'admin' ? 'info' : 'neutral'}>{r.role === 'admin' ? 'Admin' : 'Support'}</Badge></Td>
              <Td cell="c" className="text-muted-foreground">{dayIN(r.createdAt)}</Td>
              <Td cell="e" className="text-right">
                {isAdmin && r.userId !== staff.userId && (
                  <form action={removeStaffAction}><input type="hidden" name="userId" value={r.userId} /><Button type="submit" variant="ghost">Remove {r.email}</Button></form>
                )}
              </Td>
            </DataTableRow>
          ))}
        </tbody>
      </DataTable>
      {isAdmin && (
        <Section className="max-w-xl"><form action={addStaffAction} className="flex flex-wrap items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium">Add by email</label>
            <input id="email" name="email" type="email" required className="h-10 md:h-9 rounded-md border border-input bg-card px-3 font-mono text-sm" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="role" className="text-sm font-medium">Role</label>
            <select id="role" name="role" className="h-10 md:h-9 rounded-md border border-input bg-card px-2 text-sm"><option value="support">Support</option><option value="admin">Admin</option></select>
          </div>
          <Button type="submit">Add staff</Button>
          <p className="w-full text-xs text-muted-foreground">They must have signed in to Frata once with that email. Support can open merchants&apos; consoles; Admin can also edit plans and staff.</p>
        </form></Section>
      )}
    </>
  )
}
