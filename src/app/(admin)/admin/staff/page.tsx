import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { staffWithPasskeys } from '@/lib/admin/passkeys'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { staffProof } from '@/lib/auth/session'
import { dayIN } from '@/lib/format-date'
import { addStaffAction, removeStaffAction } from './actions'
import { Section } from '@/components/layout/section'
import { Submit } from '@/components/ui/submit'
import { FieldMessage } from '@/components/ui/action-form'
import { AddOwnPasskey, ApproveRequest, ConfirmFirst, RemovePasskey } from './staff-passkeys'

export const metadata = { title: 'Staff' }

export default async function StaffPage() {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const proof = await staffProof(staff.userId)
  if (!proof) return <Panel title="Confirm it's you" />
  const rows = await staffWithPasskeys(staff, proof)
  const isAdmin = staff.role === 'admin'
  const asking = isAdmin ? rows.filter((r) => r.request && !r.request.approved && r.userId !== staff.userId) : []
  return (
    <>
      <PageHeader title="Staff" />
      {asking.length > 0 && (
        <Section title={<span className="flex items-center gap-2">Asking to add a passkey <Badge tone="warn">{asking.length}</Badge></span>}>
          {asking.map((r) => (
            <div key={r.userId} className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
              <span className="font-num text-sm">{r.email}</span>
              <ApproveRequest email={r.email} />
            </div>
          ))}
        </Section>
      )}
      <DataTable>
        <DataTableHead><th>Email</th><th>Role</th><th>Passkeys</th><th>Since</th><th></th></DataTableHead>
        <DataTableBody>
          {rows.map((r) => (
            <DataTableRow key={r.userId}>
              <Td cell="a" className="font-num">{r.email}</Td>
              <Td cell="d"><Badge tone={r.role === 'admin' ? 'info' : 'neutral'}>{r.role === 'admin' ? 'Admin' : 'Support'}</Badge></Td>
              <Td cell="c">
                <div className="grid gap-2">
                  <Badge tone={r.passkeys.length >= 2 ? 'ok' : r.passkeys.length === 1 ? 'warn' : 'danger'}>{r.passkeys.length}</Badge>
                  {r.passkeys.map((k) => (
                    <div key={k.id} className="grid gap-1 text-sm">
                      <span>{k.name} <span className="text-muted-foreground">· added {dayIN(new Date(k.createdAt))}{k.lastUsedAt ? ` · used ${dayIN(new Date(k.lastUsedAt))}` : ''}</span></span>
                      {(isAdmin || r.userId === staff.userId) && <RemovePasskey id={k.id} name={k.name} owner={r.email} left={r.passkeys.length - 1} />}
                    </div>
                  ))}
                  {r.userId === staff.userId && <AddOwnPasskey />}
                  {r.request && !r.request.approved && <Badge tone="warn">Asking</Badge>}
                </div>
              </Td>
              <Td cell="c" className="text-muted-foreground">{dayIN(new Date(r.since))}</Td>
              <Td cell="e" className="text-right">
                {isAdmin && r.userId !== staff.userId && (
                  <ConfirmFirst action={removeStaffAction}><input type="hidden" name="userId" value={r.userId} /><Submit variant="ghost">Remove {r.email}</Submit></ConfirmFirst>
                )}
              </Td>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
      {isAdmin && (
        <Section className="max-w-xl"><ConfirmFirst action={addStaffAction} className="flex flex-wrap items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium">Add by email</label>
            <input id="email" name="email" type="email" required data-error="Enter an email." className="h-11 md:h-9 rounded-md border border-input bg-card px-3 text-sm aria-invalid:border-danger-mark" />
            <FieldMessage name="email" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="role" className="text-sm font-medium">Role</label>
            <select id="role" name="role" className="h-11 md:h-9 rounded-md border border-input bg-card px-2 text-sm"><option value="support">Support</option><option value="admin">Admin</option></select>
          </div>
          <Submit>Add staff</Submit>
          <p className="w-full text-xs text-muted-foreground">They must have signed in to Frrata once with that email. Support can open merchants&apos; consoles; Admin can also edit plans and staff.</p>
        </ConfirmFirst></Section>
      )}
    </>
  )
}
