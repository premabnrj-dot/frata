'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { confirmPasskey } from '@/components/passkeys/passkey-client'
import { FieldMessage, type ActionResult } from '@/components/ui/action-form'
import { Button } from '@/components/ui/button'
import { DateField } from '@/components/ui/date-field'
import { FIELD } from '@/components/ui/field'
import { Segmented } from '@/components/ui/segmented'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/components/ui/toast'
import { UnitField } from '@/components/ui/unit-field'
import { CADENCE_WORDS, CATEGORY_WORDS, COST_CADENCES, COST_CATEGORIES, type Cadence, type CostCategory, type CostCurrency } from '@/domains/admin/costs'
import { STAFF_CONFIRM_FIRST } from '@/domains/tenancy/staff-words'
import { settle } from '@/lib/settle'
import { DialogButton, MoreDialogs, type DialogSpec } from '../../_components/form-dialog'
import { addCostAction, editCostAction, endCostAction, markPaidAction, undoPaymentAction } from '../actions'

// =============================================================================
// FILE: src/app/(admin)/admin/costs/_components/forms.tsx — Admin › Costs' dialogs, as drawn in the approved mockup
// (docs/mockups/2026-11-23-admin-costs.html § Add, § Mark paid). Forms open when asked (Admin rule 5): each is a
// DialogSpec over the server action; the page decides who sees the buttons, the actions decide who may.
// =============================================================================

const SYMBOL: Record<CostCurrency, string> = { INR: '₹', USD: '$' }
const Row = ({ label, name, children }: { label: string; name: string; children: React.ReactNode }) => (
  <label className="flex min-w-0 flex-col gap-1 text-sm"><span className="font-medium">{label}</span>{children}<FieldMessage name={name} /></label>
)
const categoryOptions = COST_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_WORDS[c]}</option>)

function Day({ label, name, value, today, max }: { label: string; name: string; value: string; today: string; max?: string }) {
  const [day, setDay] = useState(value)
  return (
    <div className="flex min-w-0 flex-col gap-1 text-sm"><span className="font-medium">{label}</span>
      <input type="hidden" name={name} value={day} /><DateField label={label} value={day} onChange={setDay} today={today} {...(max ? { max } : {})} /><FieldMessage name={name} /></div>
  )
}

function Money({ name, label, currency, defaultValue, autoFocus }: { name: string; label: string; currency: CostCurrency; defaultValue?: string; autoFocus?: boolean }) {
  return <Row label={label} name={name}><UnitField unit={SYMBOL[currency]} name={name} inputMode="decimal" autoComplete="off" defaultValue={defaultValue} data-autofocus={autoFocus ? '' : undefined} /></Row>
}

const Varies = ({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) => (
  <div className="flex items-center gap-2.5 text-sm"><Switch on={on} onChange={onChange} label="Amount changes each time" /><span>Amount changes each time</span></div>
)

// ── Add a cost ──────────────────────────────────────────────────────────────────────────────────────────────────────

function AddFields({ today, starter }: { today: string; starter: { name: string; category: CostCategory } | null }) {
  const [kind, setKind] = useState<'recurring' | 'one_time'>('recurring')
  const [currency, setCurrency] = useState<CostCurrency>('INR')
  const [varies, setVaries] = useState(false)
  return (
    <>
      <input type="hidden" name="kind" value={kind} /><input type="hidden" name="varies" value={varies ? 'on' : 'off'} />
      <Segmented label="Type" value={kind} options={[['recurring', 'Repeats'], ['one_time', 'Once']]} onPick={setKind} />
      <Row label="Name" name="name"><input name="name" maxLength={80} autoComplete="off" defaultValue={starter?.name ?? ''} className={FIELD} data-autofocus="" /></Row>
      <div className="grid gap-3 sm:grid-cols-2">
        <Row label="Vendor" name="vendor"><input name="vendor" maxLength={80} autoComplete="off" placeholder="Optional" className={FIELD} /></Row>
        <Row label="Category" name="category"><select name="category" defaultValue={starter?.category ?? 'software'} className={FIELD}>{categoryOptions}</select></Row>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Row label="Currency" name="currency"><select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value as CostCurrency)} className={FIELD}><option value="INR">Rupees</option><option value="USD">Dollars</option></select></Row>
        <Money name="amount" label="Amount" currency={currency} />
      </div>
      {kind === 'one_time' ? (
        <>
          <Day label="Paid on" name="paidOn" value={today} today={today} max={today} />
          {currency === 'USD' ? <Money name="inr" label="Left your account" currency="INR" /> : null}
          <Money name="gst" label="GST included" currency="INR" />
        </>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Row label="Repeats" name="cadence"><select name="cadence" defaultValue="monthly" className={FIELD}>{COST_CADENCES.map((c) => <option key={c} value={c}>{CADENCE_WORDS[c]}</option>)}</select></Row>
            <Day label="Next due on" name="anchorOn" value={today} today={today} />
          </div>
          <Varies on={varies} onChange={setVaries} />
        </>
      )}
    </>
  )
}

/** The page's one primary. `starter` prefills the dialog from an empty-state chip. */
export function AddCostButton({ today, starter = null, label = 'Add cost', variant = 'primary' }: { today: string; starter?: { name: string; category: CostCategory } | null; label?: string; variant?: 'primary' | 'secondary' }) {
  return <DialogButton variant={variant} spec={{ label, title: 'Add a cost', action: addCostAction, fields: <AddFields today={today} starter={starter} />, keep: 'Cancel', go: 'Add cost' }} />
}

// ── Mark paid, with a toast that undoes it ──────────────────────────────────────────────────────────────────────────

export type PaidTarget = { itemId: string; name: string; currency: CostCurrency; varies: boolean; period: string; today: string; amount: string; inr: string }

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

export function MarkPaidButton({ t, primary = false, label = 'Mark paid' }: { t: PaidTarget; primary?: boolean; label?: string }) {
  const toast = useToast()
  const router = useRouter()
  const action = async (form: FormData): Promise<ActionResult> => {
    const r = await markPaidAction(form)
    if (r && r.paymentId && !r.error) {
      const paymentId = r.paymentId
      toast.ok(`${t.name} paid.`, { undo: () => undoWith(t.itemId, paymentId, router) })
      return {}
    }
    return r
  }
  const spec: DialogSpec = {
    label, title: `Mark ${t.name} paid`, action, keep: 'Cancel', go: 'Mark paid',
    fields: (
      <>
        <input type="hidden" name="itemId" value={t.itemId} /><input type="hidden" name="periodFor" value={t.period} /><input type="hidden" name="currency" value={t.currency} />
        <Day label="Paid on" name="paidOn" value={t.today} today={t.today} max={t.today} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Money name="amount" label="Billed" currency={t.currency} defaultValue={t.varies ? '' : t.amount} autoFocus={t.varies} />
          {t.currency === 'USD' ? <Money name="inr" label="Left your account" currency="INR" defaultValue={t.inr} /> : <Money name="gst" label="GST included" currency="INR" />}
        </div>
        {t.currency === 'USD' ? <Money name="gst" label="GST included" currency="INR" /> : null}
      </>
    ),
  }
  return <DialogButton spec={spec} variant={primary ? 'primary' : 'secondary'} />
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
      if (r.ok) toast.ok('Payment removed.'); else toast.error(r.error ?? 'We could not remove it. Nothing was changed.')
    }}>Undo</Button>
  )
}

// ── A cost's own actions ────────────────────────────────────────────────────────────────────────────────────────────

export type CostFacts = { id: string; name: string; vendor: string | null; category: CostCategory; note: string | null; varies: boolean; currency: CostCurrency; amount: string; cadence: Cadence | null; anchorOn: string; recurring: boolean; paid: boolean }

function DetailsFields({ c }: { c: CostFacts }) {
  const [varies, setVaries] = useState(c.varies)
  return (
    <>
      <input type="hidden" name="itemId" value={c.id} />{c.recurring ? <input type="hidden" name="varies" value={varies ? 'on' : 'off'} /> : null}
      <Row label="Name" name="name"><input name="name" maxLength={80} defaultValue={c.name} autoComplete="off" className={FIELD} data-autofocus="" /></Row>
      <div className="grid gap-3 sm:grid-cols-2">
        <Row label="Vendor" name="vendor"><input name="vendor" maxLength={80} defaultValue={c.vendor ?? ''} autoComplete="off" className={FIELD} /></Row>
        <Row label="Category" name="category"><select name="category" defaultValue={c.category} className={FIELD}>{categoryOptions}</select></Row>
      </div>
      <Row label="Note" name="note"><input name="note" maxLength={300} defaultValue={c.note ?? ''} autoComplete="off" className={FIELD} /></Row>
      {c.recurring ? <Varies on={varies} onChange={setVaries} /> : null}
    </>
  )
}

/** Edit, change amount, change schedule, End: a cost's More. */
export function CostMore({ c, today }: { c: CostFacts; today: string }) {
  const specs: DialogSpec[] = [{ label: 'Edit details…', title: `Edit ${c.name}`, action: editCostAction, fields: <DetailsFields c={c} />, keep: 'Cancel', go: 'Save' }]
  if (c.recurring) {
    specs.push({
      label: 'Change amount…', title: `Change the amount of ${c.name}`, action: editCostAction, confirm: true, keep: 'Cancel', go: 'Save amount',
      fields: <><input type="hidden" name="itemId" value={c.id} /><input type="hidden" name="currency" value={c.currency} /><Money name="amount" label="Amount" currency={c.currency} defaultValue={c.amount} autoFocus /></>,
    }, {
      label: 'Change schedule…', title: `Change the schedule of ${c.name}`, action: editCostAction, confirm: true, keep: 'Cancel', go: 'Save schedule',
      fields: <>
        <input type="hidden" name="itemId" value={c.id} />
        {c.paid ? null : <Row label="Repeats" name="cadence"><select name="cadence" defaultValue={c.cadence ?? 'monthly'} className={FIELD}>{COST_CADENCES.map((k) => <option key={k} value={k}>{CADENCE_WORDS[k]}</option>)}</select></Row>}
        <Day label="Next due on" name="anchorOn" value={c.anchorOn} today={today} />
      </>,
    }, {
      label: 'End cost…', title: `End ${c.name}?`, action: endCostAction, danger: true, keep: 'Keep it', go: 'End cost',
      fields: <><input type="hidden" name="itemId" value={c.id} /><Day label="Last day" name="endsOn" value={today} today={today} /></>,
    })
  }
  return <MoreDialogs specs={specs} label={`More for ${c.name}`} />
}
