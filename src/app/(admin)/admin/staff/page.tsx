import Link from 'next/link'
import { STAFF_ROLE_WORDS, isMasterAdmin } from '@/domains/tenancy/staff-words'
import { DataTable, DataTableBody, DataTableHead, DataTableRow, Td } from '@/components/data/data-table'
import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
import { Panel } from '@/components/ui/panel'
import { Submit } from '@/components/ui/submit'
import { staffWithPasskeys } from '@/lib/admin/passkeys'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { staffProof } from '@/lib/auth/session'
import { dayMonthIN, sinceIN } from '@/lib/format-date'
import { NeedsBand } from '../_components/needs-band'
import { addStaffAction, removeStaffAction } from './actions'
import { AddOwnPasskey, AddStaffDialog, ApproveRequest, ConfirmFirst, RemovePasskey } from './staff-passkeys'

export const metadata = { title: 'Staff' }

const roleWord = (r: string) => STAFF_ROLE_WORDS[r as 'admin' | 'support'] ?? r

/** Admin › Staff (Neel N4, board Staff): the requests that wait lead; one person in view beside the list. */
export default async function StaffPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) return <Panel title={staff.message} />
  const [proof, sp] = await Promise.all([staffProof(staff.userId), searchParams])
  if (!proof) return <Panel title="Confirm it's you" />
  const rows = await staffWithPasskeys(staff, proof)
  const now = new Date()
  const isAdmin = isMasterAdmin(staff.role)
  const asking = isAdmin ? rows.filter((r) => r.request && !r.request.approved && r.userId !== staff.userId) : []
  const open = rows.find((r) => r.userId === sp.id) ?? rows.find((r) => r.userId === staff.userId) ?? rows[0]
  const lastUsed = (r: (typeof rows)[number]) => r.passkeys.reduce<number | null>((t, k) => (k.lastUsedAt && (!t || +new Date(k.lastUsedAt) > t) ? +new Date(k.lastUsedAt) : t), null)
  const mine = open?.userId === staff.userId

  return (
    <>
      <PageHeader title="Staff" actions={isAdmin && (
        <AddStaffDialog action={addStaffAction} support={STAFF_ROLE_WORDS.support} master={STAFF_ROLE_WORDS.admin} />
      )} />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          {asking.map((r) => (
            <NeedsBand key={r.userId} title={`${r.email} asks for a first passkey.`} line="Call before approving." action={<ApproveRequest email={r.email} />} />
          ))}
          <DataTable label="Staff">
            <DataTableHead><th>Email</th><th>Role</th><th className="text-right">Passkeys</th><th>Last used</th></DataTableHead>
            <DataTableBody>
              {rows.map((r) => {
                const used = lastUsed(r)
                return (
                  <DataTableRow key={r.userId} selected={open?.userId === r.userId}>
                    <Td cell="a"><Link href={`/admin/staff?id=${r.userId}`} data-row-link className="font-num hover:underline">{r.email}</Link>{r.userId === staff.userId && <span className="text-muted-foreground"> · you</span>}</Td>
                    <Td cell="d">{roleWord(r.role)}</Td>
                    <Td cell="b" className="text-right font-num">{r.passkeys.length}</Td>
                    <Td cell="c" className="text-muted-foreground">{used ? sinceIN(new Date(used), now) : '—'}</Td>
                  </DataTableRow>
                )
              })}
            </DataTableBody>
          </DataTable>
        </div>

        {open && (
          <Section ariaLabel={open.email} title={<span className="flex flex-wrap items-center gap-2"><span className="font-num [overflow-wrap:anywhere]">{open.email}</span><Badge>{roleWord(open.role)}</Badge></span>} className="text-sm">
            {mine && open.request && !open.request.approved && (
              <NeedsBand tone="info" title="Your passkey request" line="Another master admin approves it." />
            )}
            <h3 className="text-sm font-semibold">Passkeys</h3>
            {open.passkeys.length === 0 ? <p className="text-muted-foreground">None yet.</p> : (
              <div className="divide-y divide-line-soft">
                {open.passkeys.map((k) => (
                  <div key={k.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="min-w-0">{k.name}</span>
                    <span className="flex items-center gap-2"><span className="text-muted-foreground">{k.lastUsedAt ? `Used ${dayMonthIN(new Date(k.lastUsedAt))}` : `Added ${dayMonthIN(new Date(k.createdAt))}`}</span>
                      {(isAdmin || mine) && <RemovePasskey id={k.id} name={k.name} owner={open.email} left={open.passkeys.length - 1} />}</span>
                  </div>
                ))}
              </div>
            )}
            {mine && <AddOwnPasskey />}
            {isAdmin && !mine && (
              <ConfirmFirst action={removeStaffAction} className="border-t border-border pt-3"><input type="hidden" name="userId" value={open.userId} /><Submit variant="secondary">Remove {open.email}</Submit></ConfirmFirst>
            )}
          </Section>
        )}
      </div>
    </>
  )
}
