'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ActionForm, FieldMessage } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Submit } from '@/components/ui/submit'
import { useToast } from '@/components/ui/toast'
import { settle } from '@/lib/settle'
import { assignTeamAction, inviteTeamAction, removeTeamAction, resendTeamInviteAction, setTeamRoleAction } from './actions'
import { RemoveButton } from '@/components/ui/remove-button'
import { Menu } from '@/components/ui/menu'
import { Segmented } from '@/components/ui/segmented'
import { Icon } from '@/components/icons/icon'
import { FIELD } from '@/components/ui/field'
import { freshly } from '@/components/passkeys/fresh'

type Store = { tenantId: string; name: string }

type Given = 'lead' | 'builder'

/** What each role reaches in a store, said in two lines under the choice (approved T1c mockup, screen 2). */
const REACH: Record<Given, readonly [string, string]> = {
  lead: ['Orders, products, look and settings', 'Can’t hand over or invite people'],
  builder: ['Products and the store preview', 'No orders, shoppers, costs or settings'],
}

/** Invite a Lead or a Builder (approved T1c mockup, Team › Invite): email, role, the stores they'll work on. Mistakes
 *  stay in the dialog. */
export function InviteButton({ stores }: { stores: Store[] }) {
  const [open, setOpen] = useState(false)
  const [role, setRole] = useState<Given>('lead')
  const [yes, no] = REACH[role]
  return (
    <>
      <Button onClick={() => { setRole('lead'); setOpen(true) }}>Invite</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Invite to your team"
        actions={null}>
        <ActionForm action={async (f) => { const r = await freshly(() => inviteTeamAction(f)); if (r && 'ok' in r && r.ok) setOpen(false); return r as Awaited<ReturnType<typeof inviteTeamAction>> }} className="grid gap-4">
          <div className="grid gap-1.5">
            <label htmlFor="team-email" className="text-sm font-medium">Work email</label>
            <input id="team-email" name="email" type="email" required maxLength={200} autoComplete="off" data-error="Enter their work email"
              className={FIELD} />
            <FieldMessage name="email" />
          </div>
          <div className="grid gap-1.5">
            <span id="team-role" className="text-sm font-medium">Role</span>
            <input type="hidden" name="role" value={role} />
            <Segmented label="Role" value={role} options={[['lead', 'Lead'], ['builder', 'Builder']] as const} onPick={setRole} className="justify-self-start" />
            <ul className="grid gap-1.5 text-sm" aria-live="polite">
              <li className="flex items-center gap-2"><Icon name="tick" className="size-4 text-ok-text" />{yes}</li>
              <li className="flex items-center gap-2 text-muted-foreground"><Icon name="eyeOff" className="size-4" />{no}</li>
            </ul>
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-sm font-medium">Stores they’ll work on</legend>
            {stores.length === 0 ? <p className="text-sm text-muted-foreground">No live stores yet. You can add stores later.</p> : (
              <div className="flex flex-wrap gap-2">
                {stores.map((s) => (
                  <label key={s.tenantId} className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-input px-3 py-1.5 text-sm has-[:checked]:border-foreground has-[:checked]:bg-accent">
                    <input type="checkbox" name="stores" value={s.tenantId}  />{s.name}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" data-autofocus onClick={() => setOpen(false)}>Cancel</Button>
            <Submit>Send invite</Submit>
          </div>
        </ActionForm>
      </Dialog>
    </>
  )
}

/** A Lead's or a Builder's role, changed in place (owner only; a fresh passkey check through `freshly`). */
export function RoleSelect({ memberId, role }: { memberId: string; role: Given }) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const change = async (next: Given) => {
    if (busy || next === role) return
    setBusy(true)
    const r = await freshly(() => setTeamRoleAction({ memberId, role: next })).finally(() => setBusy(false))
    if (!r.ok) return toast.error(r.error)
    toast.ok(r.text)
    settle(router)
  }
  const names: Record<Given, string> = { lead: 'Lead', builder: 'Builder' }
  return (
    <Menu label={names[role]} size="sm" items={(['lead', 'builder'] as const).map((r) => ({ label: names[r], checked: r === role, onSelect: () => void change(r) }))} />
  )
}

/** A person's stores as toggles: on adds access to that store, off ends it at once. */
export function StoreToggles({ memberId, stores, given }: { memberId: string; stores: Store[]; given: string[] }) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const flip = async (s: Store, on: boolean) => {
    if (busy) return
    setBusy(s.tenantId)
    const r = await freshly(() => assignTeamAction({ memberId, tenantId: s.tenantId, on })).finally(() => setBusy(null))
    if (!r.ok) return toast.error(r.error)
    toast.ok(on ? `Added to ${s.name}.` : `Taken off ${s.name}.`)
    settle(router)
  }
  if (!stores.length) return null
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Stores">
      {stores.map((s) => {
        const on = given.includes(s.tenantId)
        return (
          <button key={s.tenantId} type="button" aria-pressed={on} disabled={busy !== null} onClick={() => flip(s, !on)}
            className="rounded-full border border-input px-2.5 py-1 text-xs aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background disabled:opacity-60">
            {s.name}
          </button>
        )
      })}
    </div>
  )
}

/** Remove a person or withdraw an invite: it ends access, so a dialog that says what happens (§ Feedback 4). */
export function RemovePerson({ memberId, label, invited }: { memberId: string; label: string; invited: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const remove = async () => {
    setPending(true)
    const r = await freshly(() => removeTeamAction({ memberId })).finally(() => setPending(false))
    if (!r.ok) return setError(r.error)
    setOpen(false); setError(null); toast.ok(invited ? 'Invite withdrawn.' : `${label} removed.`); settle(router)
  }
  return (
    <>
      <RemoveButton label={invited ? `Withdraw invite to ${label}` : `Remove ${label}`} onClick={() => { setError(null); setOpen(true) }} />
      <Dialog open={open} onClose={() => setOpen(false)} error={error} title={invited ? `Withdraw the invite to ${label}?` : `Remove ${label}?`}
        description={invited ? undefined : <ul className="list-disc space-y-1 pl-5"><li>Their access to every store ends now.</li><li>Store invites they sent are cancelled.</li><li>Your stores and their work stay.</li></ul>}
        actions={<>
          <Button variant="secondary" data-autofocus onClick={() => setOpen(false)}>Keep</Button>
          <Button variant="destructive" disabled={pending} onClick={remove}>{pending ? 'Removing…' : invited ? 'Withdraw invite' : `Remove ${label}`}</Button>
        </>} />
    </>
  )
}

/** An invited person's sign-in email again (the first one may sit in spam or be lost). */
export function ResendInvite({ memberId }: { memberId: string }) {
  const toast = useToast()
  const [pending, setPending] = useState(false)
  const resend = async () => {
    setPending(true)
    const r = await resendTeamInviteAction({ memberId }).finally(() => setPending(false))
    if (r.ok) toast.ok(r.text); else toast.error(r.error)
  }
  return <Button variant="secondary" size="sm" busy={pending} onClick={resend}>Send invite again</Button>
}
