'use client'

import { useState, type ReactNode } from 'react'
import { Dialog, DialogError } from '@/components/ui/dialog'
import { ActionForm, type ActionResult } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Submit } from '@/components/ui/submit'
import { MoreHorizontal } from 'lucide-react'
import { Menu } from '@/components/ui/menu'
import { confirmPasskey } from '@/components/passkeys/passkey-client'
import { STAFF_CONFIRM_FIRST } from '@/domains/tenancy/staff-words'

// =============================================================================
// FILE: src/app/(admin)/admin/_components/form-dialog.tsx — FORMS OPEN WHEN ASKED (Neel N4 rules 5 and 6). A button or
// a More item opens a Dialog holding the form; the safe button keeps, the other names what happens ("End trial").
// The server action is the same one the page used; every check stays in it (hiding a button is never the control).
// =============================================================================

export type DialogSpec = {
  /** The More item's or the button's words: "End trial…". */
  label: string
  /** The dialog's question: "End Noor Threads' trial?". */
  title: string
  /** What happens, one or two short sentences. */
  description?: ReactNode
  action: (form: FormData) => Promise<ActionResult>
  /** The fields (a reason, an amount); hidden inputs carry the ids. */
  fields: ReactNode
  keep: string
  go: string
  danger?: boolean
  /** Money (Issue, a payment, a credit note, a refund): when the server asks for a fresh passkey, confirm on this
   *  device and send the same form again; nothing typed is lost (security review on the diff, finding 1). */
  confirm?: boolean
}

/** The action first; the passkey only when the server asks for a fresh one (never while passkeys are off for everyone,
 *  Admin › Staff, drizzle/0171), then the same form again; nothing typed is lost. */
export const confirmWhenAsked = (action: (form: FormData) => Promise<ActionResult>) => async (form: FormData): Promise<ActionResult> => {
  const r = await action(form)
  if (!r || !('error' in r) || r.error !== STAFF_CONFIRM_FIRST) return r
  const c = await confirmPasskey()
  return c.ok ? action(form) : { error: c.error }
}
/** The spec's action, with the passkey step when the server asks for it. */
const withConfirm = (spec: DialogSpec) => (spec.confirm ? confirmWhenAsked(spec.action) : spec.action)

function Body({ spec, onClose, onError, error }: { spec: DialogSpec; onClose: () => void; onError: (m: string | null) => void; error: string | null }) {
  return (
    <ActionForm action={withConfirm(spec)} onDone={onClose} onError={onError} className="flex flex-col gap-3">
      {spec.fields}
      <DialogError error={error} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose} data-autofocus="">{spec.keep}</Button>
        <Submit variant={spec.danger ? 'destructive' : 'primary'}>{spec.go}</Submit>
      </div>
    </ActionForm>
  )
}

/** One button that opens one dialog. */
export function DialogButton({ spec, variant = 'secondary' }: { spec: DialogSpec; variant?: 'primary' | 'secondary' }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const close = () => { setOpen(false); setError(null) }
  return (
    <>
      <Button type="button" variant={variant} onClick={() => setOpen(true)}>{spec.label.replace(/…$/, '')}</Button>
      <Dialog open={open} onClose={close} title={spec.title} description={spec.description} actions={null}>
        {open ? <Body spec={spec} onClose={close} onError={setError} error={error} /> : null}
      </Dialog>
    </>
  )
}

/** More: rare and final actions, each opening its dialog. */
/** `label` given: a ⋯ on a row, named for it ("More for GST"); absent: the page's More. */
export function MoreDialogs({ specs, label }: { specs: DialogSpec[]; label?: string }) {
  const [open, setOpen] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const close = () => { setOpen(null); setError(null) }
  if (!specs.length) return null
  const spec = open === null ? null : specs[open]
  return (
    <>
      <Menu {...(label ? { label, size: 'sm' as const, icon: <MoreHorizontal aria-hidden="true" className="size-4" /> } : {})} items={specs.map((s, i) => ({ label: s.label, danger: s.danger, onSelect: () => setOpen(i) }))} />
      <Dialog open={spec !== null} onClose={close} title={spec?.title ?? ''} description={spec?.description} actions={null}>
        {spec ? <Body spec={spec} onClose={close} onError={setError} error={error} /> : null}
      </Dialog>
    </>
  )
}
