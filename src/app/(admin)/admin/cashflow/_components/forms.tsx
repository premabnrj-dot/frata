'use client'

import { Plus } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { confirmPasskey } from '@/components/passkeys/passkey-client'
import type { ActionResult } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { STAFF_CONFIRM_FIRST } from '@/domains/tenancy/staff-words'
import { settle } from '@/lib/settle'
import { DialogButton, MoreDialogs, type DialogSpec } from '../../_components/form-dialog'
import { addAccountAction, addEntryAction, deleteEntryAction, editEntryAction, setBalanceAction, undoBalanceAction } from '../actions'
import type { AcctOption, EditableEntry } from './fields'

// =============================================================================
// FILE: src/app/(admin)/admin/cashflow/_components/forms.tsx — Admin › Cashflow's dialogs, as drawn in the approved mockup (docs/mockups/2026-11-23-admin-cashflow.html § Add an
// entry, § Update balance). Forms open when asked (Admin rule 5): each is a DialogSpec over the server action; the page decides who sees the buttons, the actions decide who may.
// The fields load when a dialog opens (next/dynamic) to keep the page's first-load script small.
// =============================================================================

const BalanceFields = dynamic(() => import('./fields').then((m) => m.BalanceFields))
const EntryFields = dynamic(() => import('./fields').then((m) => m.EntryFields))
const EditEntryFields = dynamic(() => import('./fields').then((m) => m.EditEntryFields))
const AccountFields = dynamic(() => import('./fields').then((m) => m.AccountFields))

/** Undo a balance, with the passkey step when the server asks (one older than ten minutes). */
async function undoWith(accountId: string, balanceId: string, router: ReturnType<typeof useRouter>): Promise<{ ok: boolean; error?: string }> {
  const form = new FormData()
  form.set('accountId', accountId); form.set('balanceId', balanceId)
  let r = await undoBalanceAction(form)
  if (r && r.error === STAFF_CONFIRM_FIRST) {
    const c = await confirmPasskey()
    if (!c.ok) return { ok: false, error: c.error }
    r = await undoBalanceAction(form)
  }
  if (r && r.error) return { ok: false, error: r.error }
  settle(router)
  return { ok: true }
}

/** The page's one primary. A toast follows a saved balance, with Undo. */
export function UpdateBalanceButton({ accounts, floor, today, primary = true }: { accounts: AcctOption[]; floor: number | null; today: string; primary?: boolean }) {
  const toast = useToast()
  const router = useRouter()
  const action = async (form: FormData): Promise<ActionResult> => {
    const r = await setBalanceAction(form)
    if (r && r.balanceId && r.accountId && !r.error) {
      const { balanceId, accountId } = r
      toast.ok('Balance saved.', { undo: () => undoWith(accountId, balanceId, router) })
      return {}
    }
    return r
  }
  return <DialogButton variant={primary ? 'primary' : 'secondary'} spec={{ label: 'Update balance', title: 'Update balance', action, keep: 'Cancel', go: 'Save balance', fields: <BalanceFields accounts={accounts} floor={floor} today={today} /> }} />
}

export function AddEntryButton({ accounts, today }: { accounts: AcctOption[]; today: string }) {
  return <DialogButton variant="secondary" spec={{ label: 'Add entry', icon: <Plus aria-hidden="true" className="size-4" />, title: 'Add an entry', action: addEntryAction, keep: 'Cancel', go: 'Add entry', fields: <EntryFields accounts={accounts} today={today} /> }} />
}

export function AddAccountButton() {
  return <DialogButton variant="secondary" spec={{ label: 'Add account', title: 'Add an account', action: addAccountAction, keep: 'Cancel', go: 'Add account', fields: <AccountFields /> }} />
}

/** Undo the latest balance of an account, from the Accounts tab. */
export function UndoBalanceButton({ accountId, balanceId, name }: { accountId: string; balanceId: string; name: string }) {
  const toast = useToast()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <Button type="button" variant="ghost" size="sm" busy={busy} aria-label={`Undo ${name} balance`} onClick={async () => {
      setBusy(true)
      const r = await undoWith(accountId, balanceId, router)
      setBusy(false)
      if (r.ok) toast.ok('Balance removed.'); else toast.error(r.error ?? 'We couldn’t remove it. Nothing was changed.')
    }}>Undo</Button>
  )
}

/** A planned entry that has now happened, on the day it was expected: free of the passkey (a different day or amount is an Edit). */
export function MarkReceivedButton({ id, expectedOn, outgoing, name }: { id: string; expectedOn: string; outgoing: boolean; name: string }) {
  const toast = useToast()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <Button type="button" variant="secondary" size="sm" busy={busy} aria-label={`${outgoing ? 'Mark paid' : 'Mark received'}, ${name}`} onClick={async () => {
      setBusy(true)
      const f = new FormData(); f.set('id', id); f.set('happenedOn', expectedOn); f.set('expectedOn', '')
      const r = await editEntryAction(f)
      setBusy(false)
      if (r?.error) toast.error(r.error); else { toast.ok(outgoing ? 'Marked paid.' : 'Marked received.'); settle(router) }
    }}>{outgoing ? 'Mark paid' : 'Mark received'}</Button>
  )
}

/** An entry's own actions: Edit and Remove. */
export function EntryMore({ e, today }: { e: EditableEntry & { name: string }; today: string }) {
  const specs: DialogSpec[] = [
    { label: 'Edit…', title: `Edit ${e.name}`, action: editEntryAction, confirm: true, keep: 'Cancel', go: 'Save entry', fields: <EditEntryFields e={e} today={today} /> },
    {
      label: 'Remove…', title: `Remove ${e.name}?`, description: 'It no longer counts in cash in bank.', action: deleteEntryAction, danger: true, confirm: true, keep: 'Keep it', go: 'Remove entry',
      fields: <input type="hidden" name="id" value={e.id} />,
    },
  ]
  return <MoreDialogs specs={specs} label={`More for ${e.name}`} />
}
