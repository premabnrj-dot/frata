'use client'

import { useState } from 'react'
import { RemoveButton } from '@/components/ui/remove-button'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ActionForm, FieldMessage, type ActionResult } from '@/components/ui/action-form'
import { Dialog, DialogError } from '@/components/ui/dialog'
import { FIELD } from '@/components/ui/field'
import { Submit } from '@/components/ui/submit'
import { useToast } from '@/components/ui/toast'
import { addPasskey, approve, confirmPasskey, removeOne } from '@/components/passkeys/passkey-client'
import { STAFF_CONFIRM_FIRST } from '@/domains/tenancy/staff-words'

// =============================================================================
// FILE: src/app/(admin)/admin/staff/staff-passkeys.tsx — Admin › Staff's passkey controls (staff passkeys spec;
// mockup https://claude.ai/artifact/Xng3BV15YZpDQi9MoYLGsZ). Each one confirms with the admin's own passkey first:
// approving, removing, and adding or removing staff need a check in the last 5 minutes. A failure is an error toast
// (§ Feedback 1), the words passkey-client gives.
// =============================================================================

/** Approve a person's request with the code they read out. */
export function ApproveRequest({ email }: { email: string }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  if (!open) return <Button onClick={() => setOpen(true)}>Approve</Button>
  return (
    <div className="grid w-full max-w-sm gap-2">
      <label htmlFor={`code-${email}`} className="grid gap-1.5 text-sm font-medium">Code {email.split('@')[0]} reads to you
        <input id={`code-${email}`} inputMode="numeric" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value.replace(/[^0-9 ]/g, '').slice(0, 7))}
          className="h-11 rounded-md border border-input bg-card px-3 font-mono text-sm tracking-widest md:h-9" />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => { setOpen(false); setCode('') }}>Cancel</Button>
        <Button disabled={busy || code.replace(/\D/g, '').length !== 6} onClick={async () => {
          setBusy(true); toast.dismiss()
          const r = await approve(email, code)
          setBusy(false)
          if (r.ok) { setOpen(false); router.refresh() } else toast.error(r.error)
        }}>{busy ? 'Waiting for your device…' : 'Confirm with passkey and approve'}</Button>
      </div>
    </div>
  )
}

/** One passkey's Remove, with its confirmation. */
export function RemovePasskey({ id, name, owner, left }: { id: string; name: string; owner: string; left: number }) {
  const router = useRouter()
  const toast = useToast()
  const [ask, setAsk] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!ask) return <RemoveButton label={`Remove ${name}`} onClick={() => setAsk(true)} />
  return (
    <div role="group" aria-label={`Remove ${name}`} className="grid gap-2 rounded-md border border-destructive/30 p-3">
      <p className="text-sm font-medium">Remove {name}?</p>
      <p className="text-sm text-muted-foreground">{owner} keeps {left} passkey{left === 1 ? '' : 's'}.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setAsk(false)}>Keep</Button>
        <Button variant="destructive" disabled={busy} onClick={async () => {
          setBusy(true); toast.dismiss()
          const r = await removeOne(id)
          setBusy(false)
          if (r.ok) { setAsk(false); router.refresh() } else toast.error(r.error)
        }}>{busy ? 'Waiting for your device…' : 'Confirm with passkey and remove'}</Button>
      </div>
    </div>
  )
}

/** Your own second device: add another passkey (this session is already confirmed). */
export function AddOwnPasskey() {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  if (!open) return <Button variant="secondary" onClick={() => setOpen(true)}>Add a passkey</Button>
  return (
    <div className="grid w-full max-w-sm gap-2">
      <label htmlFor="own-pk" className="grid gap-1.5 text-sm font-medium">Name
        <input id="own-pk" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="My phone"
          className="h-11 rounded-md border border-input bg-card px-3 text-sm md:h-9" />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
        <Button disabled={busy || !name.trim()} onClick={async () => {
          setBusy(true); toast.dismiss()
          const r = await addPasskey(name.trim(), true)
          setBusy(false)
          if (r.ok) { setOpen(false); setName(''); router.refresh() } else toast.error(r.error)
        }}>{busy ? 'Waiting for your device…' : 'Confirm with passkey and add'}</Button>
      </div>
    </div>
  )
}

/** A server-action form that confirms with a passkey before it posts (adding or removing staff). An <ActionForm>: the
 *  browser's rules first, then the passkey, then the action; a refusal from either is its error toast. */
/** The action first; the passkey only when the server asks for a fresh one (never while passkeys are off for everyone,
 *  Admin › Staff, drizzle/0171), then the same form again. */
const confirmWhenAsked = (action: (form: FormData) => Promise<ActionResult>) => async (form: FormData): Promise<ActionResult> => {
  const r = await action(form)
  if (!r || !('error' in r) || r.error !== STAFF_CONFIRM_FIRST) return r
  const c = await confirmPasskey()
  return c.ok ? action(form) : { error: c.error }
}

export function ConfirmFirst({ action, children, className }: { action: (form: FormData) => Promise<ActionResult>; children: React.ReactNode; className?: string }) {
  return <ActionForm action={confirmWhenAsked(action)} className={className}>{children}</ActionForm>
}

/** Add staff (Neel N4, board Staff): a button that opens the form in a dialog; it confirms with a passkey first. */
export function AddStaffDialog({ action, support, master }: { action: (form: FormData) => Promise<ActionResult>; support: string; master: string }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const close = () => { setOpen(false); setError(null) }
  const confirmed = confirmWhenAsked(action)
  const field = `${FIELD} aria-invalid:border-danger-mark`
  return (
    <>
      <Button onClick={() => setOpen(true)}>Add staff</Button>
      <Dialog open={open} onClose={close} title="Add staff" actions={null}>
        {open && (
          <ActionForm action={confirmed} onDone={close} onError={setError} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Email</span>
              <input name="email" type="email" required data-error="Enter an email." className={field} /><FieldMessage name="email" /></label>
            <label className="flex flex-col gap-1 text-sm"><span className="font-medium">Role</span>
              <select name="role" className={field}><option value="support">{support}</option><option value="admin">{master}</option></select></label>
            <p className="text-sm text-muted-foreground">They must have signed in to Frrata once with that email.</p>
            <DialogError error={error} />
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={close} data-autofocus="">Not now</Button>
              <Submit>Add staff</Submit>
            </div>
          </ActionForm>
        )}
      </Dialog>
    </>
  )
}
