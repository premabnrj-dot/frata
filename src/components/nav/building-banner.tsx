'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { handOverAction } from '@/app/(console)/console/handover-actions'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FieldError, useFieldErrors } from '@/components/ui/field-error'

/**
 * A partner building a store with no owner yet (approved mockup screen 7): one line above every console page and
 * Hand over. Sends one owner invite; a second one replaces the first. Not shown in a support visit. A mistake in the
 * email stays under the field; a refused hand-over is the Dialog's error line (frata-design-language § Feedback 3, 4).
 */
export function BuildingBanner({ shop, inviteEmail }: { shop: string; inviteEmail: string | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const formRef = useRef<HTMLFormElement>(null)
  const fields = useFieldErrors({ scope: formRef })
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(inviteEmail)
  const [pending, start] = useTransition()
  const send = (e: React.FormEvent) => {
    e.preventDefault()
    start(async () => {
      const r = await handOverAction({ email })
      if (!r.ok) { if (r.field) fields.set({ 'owner-email': r.error }); else setError(r.error); return }
      setSent(r.emailed ? r.email : `${r.email} (email not sent: they can sign in at /login)`); setOpen(false); router.refresh()
    })
  }
  return (
    <div role="status" className="sticky top-0 z-40 flex h-[var(--shell-top)] items-center gap-3 border-b border-border bg-info px-4 text-sm text-info-text md:px-5 print:hidden">
      <span className="min-w-0 truncate font-semibold">Building for {shop}</span>
      <span className="hidden min-w-0 truncate md:inline">{sent ? `Invite sent to ${sent}` : 'No owner yet'}</span>
      <span className="ml-auto" />
      <a href="/partner" className="hidden shrink-0 underline md:inline">Clients</a>
      <button type="button" onClick={() => { setError(null); fields.set({}); setEmail(''); setOpen(true) }} className="inline-flex min-h-6 shrink-0 items-center font-semibold underline">
        {sent ? 'Send again' : 'Hand over'}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Hand ${shop} to its owner`} error={error}
        description={<ul className="list-disc space-y-1 pl-5"><li>They own the store and its data.</li><li>You stay on as partner. No billing, payment keys or people.</li><li>Your 20% starts when the shop opens.</li></ul>}
        actions={<>
          <Button variant="secondary" data-autofocus onClick={() => setOpen(false)}>Keep building</Button>
          <Button type="submit" form="handover" disabled={pending}>{pending ? 'Sending…' : 'Send invite'}</Button>
        </>}>
        <form id="handover" ref={formRef} onSubmit={send} noValidate className="space-y-1.5">
          <label htmlFor="owner-email" className="block text-sm font-medium text-foreground">Owner’s email</label>
          <input id="owner-email" type="email" inputMode="email" autoComplete="off" value={email} onChange={(e) => { setEmail(e.target.value); fields.clear('owner-email'); setError(null) }}
            {...fields.props('owner-email')}
            className="h-11 w-full rounded-md border border-input bg-card px-3 font-mono text-sm text-foreground aria-invalid:border-danger-text md:h-9" />
          <FieldError name="owner-email" message={fields.errors['owner-email']} reserve />
        </form>
      </Dialog>
    </div>
  )
}
