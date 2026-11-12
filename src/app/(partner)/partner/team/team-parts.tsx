'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ActionForm, FieldMessage } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Submit } from '@/components/ui/submit'
import { useToast } from '@/components/ui/toast'
import { settle } from '@/lib/settle'
import { assignTeamAction, inviteTeamAction, removeTeamAction } from './actions'

type Store = { tenantId: string; name: string }

/** Invite a Lead (approved Studio mockup, Team › Invite): email, the stores they'll work on. Mistakes stay in the dialog. */
export function InviteButton({ stores }: { stores: Store[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Invite</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Invite to your team"
        actions={null}>
        <ActionForm action={async (f) => { const r = await inviteTeamAction(f); if (r && 'ok' in r && r.ok) setOpen(false); return r }} className="grid gap-4">
          <div className="grid gap-1.5">
            <label htmlFor="team-email" className="text-sm font-medium">Work email</label>
            <input id="team-email" name="email" type="email" required maxLength={200} autoComplete="off" data-error="Enter their work email"
              className="h-11 w-full rounded-md border border-input bg-card px-3 text-sm md:h-9" />
            <FieldMessage name="email" />
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-sm font-medium">Stores they’ll work on</legend>
            {stores.length === 0 ? <p className="text-sm text-muted-foreground">No live stores yet. You can add stores later.</p> : (
              <div className="flex flex-wrap gap-2">
                {stores.map((s) => (
                  <label key={s.tenantId} className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-input px-3 py-1.5 text-sm has-[:checked]:border-foreground has-[:checked]:bg-accent">
                    <input type="checkbox" name="stores" value={s.tenantId} className="size-4 accent-foreground" />{s.name}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <p className="text-xs text-muted-foreground">As a Lead: builds the stores you give them. Handing over and the team stay with you.</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" data-autofocus onClick={() => setOpen(false)}>Cancel</Button>
            <Submit>Send invite</Submit>
          </div>
        </ActionForm>
      </Dialog>
    </>
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
    const r = await assignTeamAction({ memberId, tenantId: s.tenantId, on }).finally(() => setBusy(null))
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
    const r = await removeTeamAction({ memberId }).finally(() => setPending(false))
    if (!r.ok) return setError(r.error)
    setOpen(false); setError(null); toast.ok(invited ? 'Invite withdrawn.' : `${label} removed.`); settle(router)
  }
  return (
    <>
      <Button variant="ghost" onClick={() => { setError(null); setOpen(true) }}>{invited ? 'Withdraw' : 'Remove'}</Button>
      <Dialog open={open} onClose={() => setOpen(false)} error={error} title={invited ? `Withdraw the invite to ${label}?` : `Remove ${label}?`}
        description={invited ? undefined : <ul className="list-disc space-y-1 pl-5"><li>Their access to every store ends now.</li><li>Store invites they sent are cancelled.</li><li>Your stores and their work stay.</li></ul>}
        actions={<>
          <Button variant="secondary" data-autofocus onClick={() => setOpen(false)}>Keep</Button>
          <Button variant="destructive" disabled={pending} onClick={remove}>{pending ? 'Removing…' : invited ? 'Withdraw' : `Remove ${label}`}</Button>
        </>} />
    </>
  )
}
