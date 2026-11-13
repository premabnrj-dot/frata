'use client'

import { useEffect, useId, useState } from 'react'
import { Button } from './button'
import { Dialog } from './dialog'
import { FIELD } from './field'

// =============================================================================
// FILE: src/components/ui/confirm-delete.tsx — ASK BEFORE SOMETHING IS LOST (Neel N0b, § More components · Dialogs).
//
// The thing in the title ("Delete 2 drafts?"), the consequence in one line, the safe button first and focused. Five or
// more: the person types the count before the button works ("Type 12 to delete them"). A refusal stays in the dialog.
// =============================================================================

export function ConfirmDelete({ open, count, noun, consequence, keep = 'Keep them', verb = 'Delete', onConfirm, onClose, error, busy }: {
  open: boolean
  count: number
  /** Singular and plural: ['draft', 'drafts']. */
  noun: [string, string]
  /** One line: what follows ("This can't be undone."), or the names when there are a few. */
  consequence: React.ReactNode
  keep?: string; verb?: string
  onConfirm: () => void; onClose: () => void
  error?: string | null; busy?: boolean
}) {
  const id = useId()
  const [typed, setTyped] = useState('')
  useEffect(() => { if (!open) setTyped('') }, [open])
  const what = `${count} ${count === 1 ? noun[0] : noun[1]}`
  const ask = count >= 5
  const ready = !ask || typed.trim() === String(count)
  return (
    <Dialog open={open} onClose={onClose} title={`${verb} ${what}?`} description={consequence} error={error}
      actions={<>
        <Button variant="secondary" data-autofocus onClick={onClose}>{keep}</Button>
        <Button variant="destructive" busy={busy} disabled={!ready} onClick={onConfirm}>{verb} {what}</Button>
      </>}>
      {ask ? <label htmlFor={id} className="grid gap-1.5"><span className="text-label font-medium">Type {count} to {verb.toLowerCase()} them</span>
        <input id={id} inputMode="numeric" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} className={`${FIELD} w-full font-num`} /></label> : null}
    </Dialog>
  )
}
