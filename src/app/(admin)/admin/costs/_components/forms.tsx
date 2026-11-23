'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { confirmPasskey } from '@/components/passkeys/passkey-client'
import type { ActionResult } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import type { Cadence, CostCategory, CostCurrency } from '@/domains/admin/costs'
import { STAFF_CONFIRM_FIRST } from '@/domains/tenancy/staff-words'
import { formatInr } from '@/lib/format'
import { paise } from '@/domains/money/paise'
import { settle } from '@/lib/settle'
import { DialogButton, MoreDialogs, type DialogSpec } from '../../_components/form-dialog'
import { addCostAction, editCostAction, endCostAction, markPaidAction, undoPaymentAction } from '../actions'

// =============================================================================
// FILE: src/app/(admin)/admin/costs/_components/forms.tsx — Admin › Costs' dialogs, as drawn in the approved mockup
// (docs/mockups/2026-11-23-admin-costs.html § Add, § Mark paid). Forms open when asked (Admin rule 5): each is a
// DialogSpec over the server action; the page decides who sees the buttons, the actions decide who may.
// =============================================================================

/** The page's one primary. `starter` prefills the dialog from an empty-state chip. */
export function AddCostButton({ today, starter = null, label = 'Add cost', variant = 'primary' }: { today: string; starter?: { name: string; category: CostCategory } | null; label?: string; variant?: 'primary' | 'secondary' }) {
  return <DialogButton variant={variant} spec={{ label, ...(variant === 'primary' ? { short: 'Add' } : {}), icon: variant === 'primary' ? <Plus aria-hidden="true" className="size-4" /> : undefined, title: 'Add a cost', action: addCostAction, fields: <AddFields today={today} starter={starter} />, keep: 'Cancel', go: 'Add cost' }} />
}

// ── Mark paid, with a toast that undoes it ──────────────────────────────────────────────────────────────────────────

export type PaidTarget = { itemId: string; name: string; currency: CostCurrency; varies: boolean; period: string; periodText: string; today: string; amount: string; inr: string }

/** Undo with the passkey step when the server asks (a payment older than ten minutes). */
async function undoWith(itemId: string, paymentId: string, router: ReturnType<typeof useRouter>): Promise<{ ok: boolean; error?: string }> {
  const form = new FormData()
  form.set('itemId', itemId); form.set('paymentId', paymentId)
  let r = await undoPaymentAction(form)
  if (r && r.error === STAFF_CONFIRM_FIRST) {
    const c = await confirmPasskey()
    if (!c.ok) return { ok: false, error: c.error }
    r = await undoPaymentAction(form)
  }
  if (r && r.error) return { ok: false, error: r.error }
  settle(router)
  return { ok: true }
}

export function MarkPaidButton({ t, primary = false, small = false, label = 'Mark paid' }: { t: PaidTarget; primary?: boolean; small?: boolean; label?: string }) {
  const toast = useToast()
  const router = useRouter()
  const action = async (form: FormData): Promise<ActionResult> => {
    const r = await markPaidAction(form)
    if (r && r.paymentId && !r.error) {
      const paymentId = r.paymentId
      toast.ok(r.inrPaise ? `${t.name} paid · ${formatInr(paise(r.inrPaise))}` : `${t.name} paid.`, { undo: () => undoWith(t.itemId, paymentId, router) })
      return {}
    }
    return r
  }
  const spec: DialogSpec = {
    label, title: `Mark ${t.name} paid`, action, keep: 'Cancel', go: 'Mark paid',
    fields: <PaidFields t={t} />,
  }
  return <DialogButton spec={{ ...spec, ...(small ? { size: 'sm' as const } : {}) }} variant={primary ? 'primary' : 'secondary'} />
}

export function UndoPaymentButton({ itemId, paymentId }: { itemId: string; paymentId: string }) {
  const toast = useToast()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <Button type="button" variant="ghost" size="sm" busy={busy} onClick={async () => {
      setBusy(true)
      const r = await undoWith(itemId, paymentId, router)
      setBusy(false)
      if (r.ok) toast.ok('Payment removed.'); else toast.error(r.error ?? 'We couldn’t remove it. Nothing was changed.')
    }} aria-label="Undo payment">Undo</Button>
  )
}

// ── A cost's own actions ────────────────────────────────────────────────────────────────────────────────────────────

export type CostFacts = { id: string; name: string; vendor: string | null; category: CostCategory; note: string | null; varies: boolean; currency: CostCurrency; amount: string; cadence: Cadence | null; anchorOn: string; recurring: boolean; paid: boolean }

// The fields load when a dialog opens (they hold the date picker, the switch and the segmented choice).
const AddFields = dynamic(() => import('./fields').then((m) => m.AddFields))
const PaidFields = dynamic(() => import('./fields').then((m) => m.PaidFields))
const DetailsFields = dynamic(() => import('./fields').then((m) => m.DetailsFields))
const AmountChangeFields = dynamic(() => import('./fields').then((m) => m.AmountChangeFields))
const ScheduleFields = dynamic(() => import('./fields').then((m) => m.ScheduleFields))
const EndFields = dynamic(() => import('./fields').then((m) => m.EndFields))

const editSpec = (c: CostFacts): DialogSpec => ({ label: 'Edit', title: `Edit ${c.name}`, action: editCostAction, fields: <DetailsFields c={c} />, keep: 'Cancel', go: 'Save details' })
const endSpec = (c: CostFacts, today: string): DialogSpec => ({
  label: 'End cost', title: `End ${c.name}?`, description: 'Bills stop after the last day you pick. Past payments stay.', action: endCostAction, danger: true, keep: 'Keep it', go: 'End cost',
  fields: <EndFields c={c} today={today} />,
})

/** The panel's header menu: the two changes that need a fresh passkey check (a repeating cost only). */
export function CostHeaderMenu({ c, today }: { c: CostFacts; today: string }) {
  if (!c.recurring) return null
  const specs: DialogSpec[] = [{
    label: 'Change amount…', title: `Change the amount of ${c.name}?`, description: 'Past payments keep their figures.', action: editCostAction, confirm: true, keep: 'Keep amount', go: 'Change amount',
    fields: <AmountChangeFields c={c} />,
  }, {
    label: 'Change schedule…', title: `Change the schedule of ${c.name}?`, description: 'Bills count from the new date. Paid bills stay paid.', action: editCostAction, confirm: true, keep: 'Keep schedule', go: 'Change schedule',
    fields: <ScheduleFields c={c} today={today} />,
  }]
  return <MoreDialogs specs={specs} label={`More for ${c.name}`} />
}

/** The panel's foot, as drawn: Mark paid, Edit, End cost (a repeating cost still running; a one-time or ended cost only edits). */
export function CostFooter({ c, today, target }: { c: CostFacts; today: string; target: PaidTarget | null }) {
  return (
    <>
      {target ? <MarkPaidButton t={target} primary /> : null}
      <DialogButton spec={editSpec(c)} />
      {c.recurring ? <span className="ml-auto"><DialogButton spec={endSpec(c, today)} /></span> : null}
    </>
  )
}
