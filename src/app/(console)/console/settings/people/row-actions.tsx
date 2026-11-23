'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { addPersonAction, cancelInviteAction, cancelPartnerRequestAction, removePersonAction } from './people-actions'

/** Remove a person: their access ends, so a dialog naming both outcomes (design language § Words 8). */
export function RemovePerson({ member, name }: { member: string; name: string }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const remove = () => start(async () => {
    const r = await removePersonAction(member)
    if (!r.ok) return setError(r.error)
    setOpen(false); toast.ok(`Removed ${name}.`); router.refresh()
  })
  return (
    <>
      <Button size="sm" variant="secondary" className="text-danger-text" aria-label={`Remove ${name}`} onClick={() => { setError(null); setOpen(true) }}>Remove</Button>
      <Dialog open={open} onClose={() => setOpen(false)} error={error} title={`Remove ${name}?`} description={<ul className="list-disc pl-5"><li>Their access ends now.</li></ul>}
        actions={<>
          <Button variant="secondary" data-autofocus onClick={() => setOpen(false)}>Keep {name}</Button>
          <Button variant="destructive" disabled={pending} onClick={remove}>{pending ? 'Removing…' : `Remove ${name}`}</Button>
        </>} />
    </>
  )
}

/** Cancel an invitation (a person's, or the partner's) or send an expired one again: one step, a toast after. */
export function InviteButton({ kind, id, email, role }: { kind: 'cancel' | 'cancel_partner' | 'again'; id?: string; email?: string; role?: string }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, start] = useTransition()
  const run = () => start(async () => {
    const r = kind === 'cancel' ? await cancelInviteAction(id!) : kind === 'cancel_partner' ? await cancelPartnerRequestAction() : await addPersonAction({ email: email!, role: role! })
    if (!r.ok) return toast.error(r.error)
    toast.ok(kind === 'again' ? `Invitation sent to ${email}.` : 'Invitation cancelled.')
    router.refresh()
  })
  return kind === 'again'
    ? <Button size="sm" variant="secondary" disabled={pending} onClick={run}>Send invitation again</Button>
    : <Button size="sm" variant="secondary" className="text-danger-text" disabled={pending} onClick={run}>Cancel invitation</Button>
}
