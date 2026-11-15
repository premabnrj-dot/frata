'use client'

import { useState, type ReactNode } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { ActionForm, type ActionResult } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { Submit } from '@/components/ui/submit'
import { Menu } from '@/components/ui/menu'

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
}

function Body({ spec, onClose, onError }: { spec: DialogSpec; onClose: () => void; onError: (m: string | null) => void }) {
  return (
    <ActionForm action={spec.action} onDone={onClose} onError={onError} className="flex flex-col gap-3">
      {spec.fields}
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
      <Dialog open={open} onClose={close} title={spec.title} description={spec.description} actions={null} error={error}>
        {open ? <Body spec={spec} onClose={close} onError={setError} /> : null}
      </Dialog>
    </>
  )
}

/** More: rare and final actions, each opening its dialog. */
export function MoreDialogs({ specs }: { specs: DialogSpec[] }) {
  const [open, setOpen] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const close = () => { setOpen(null); setError(null) }
  if (!specs.length) return null
  const spec = open === null ? null : specs[open]
  return (
    <>
      <Menu items={specs.map((s, i) => ({ label: s.label, danger: s.danger, onSelect: () => setOpen(i) }))} />
      <Dialog open={spec !== null} onClose={close} title={spec?.title ?? ''} description={spec?.description} actions={null} error={error}>
        {spec ? <Body spec={spec} onClose={close} onError={setError} /> : null}
      </Dialog>
    </>
  )
}
