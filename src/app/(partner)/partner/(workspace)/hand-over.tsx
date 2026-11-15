'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FieldError, useFieldErrors } from '@/components/ui/field-error'
import { useToast } from '@/components/ui/toast'
import { FingerprintIcon } from '@/components/passkeys/partner-frame'
import { partnerPasskeys } from '@/components/passkeys/fresh'
import { settle } from '@/lib/settle'
import { handOverAction } from './handover-actions'

/**
 * Hand a client store to its owner (partner sign-in mockup screen 17): the owner's email, then the partner's passkey
 * again (never an email code), then the invite. A mistake in the email stays at the field; a refusal is the dialog's
 * error line (§ Feedback 3, 4). Opened from the row, or by the console's building line (`?handover=<store>`).
 */
export function HandOver({ tenantId, store, again, startOpen = false }: { tenantId: string; store: string; again: boolean; startOpen?: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(startOpen)
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const fields = useFieldErrors({ scope: formRef })
  const send = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setBusy(true); setError(null)
    const c = await partnerPasskeys.confirmPasskey()
    if (!c.ok) { setBusy(false); return setError(c.error) }
    const r = await handOverAction({ tenantId, email })
    setBusy(false)
    if (!r.ok) { if (r.field) fields.set({ 'owner-email': r.error }); else setError(r.error); return }
    setOpen(false)
    toast.ok(r.emailed ? `Invite sent to ${r.email}.` : `Invite made for ${r.email}. The email didn’t send: ask them to sign in with that address.`)
    settle(router)
  }
  return (
    <>
      <Button variant="secondary" onClick={() => { setError(null); fields.set({}); setEmail(''); setOpen(true) }}>{again ? 'Send invite again' : 'Hand over'}</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Hand ${store} to its owner?`} error={error}
        description="It’s theirs once the invite is accepted."
        actions={<>
          <Button variant="secondary" data-autofocus onClick={() => setOpen(false)}>Keep building</Button>
          <Button type="submit" form={`handover-${tenantId}`} busy={busy}><FingerprintIcon />Hand over</Button>
        </>}>
        <form id={`handover-${tenantId}`} ref={formRef} onSubmit={send} noValidate className="grid gap-1.5">
          <label htmlFor={`owner-email-${tenantId}`} className="text-sm font-medium text-foreground">Owner’s email</label>
          <input id={`owner-email-${tenantId}`} type="email" inputMode="email" autoComplete="off" value={email}
            onChange={(e) => { setEmail(e.target.value); fields.clear('owner-email'); setError(null) }} {...fields.props('owner-email')}
            className="h-11 w-full rounded-md border border-input bg-card px-3 font-num text-sm text-foreground aria-invalid:border-danger-text md:h-9" />
          <FieldError name="owner-email" message={fields.errors['owner-email']} reserve />
        </form>
      </Dialog>
    </>
  )
}
