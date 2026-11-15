'use client'

import { useRouter } from 'next/navigation'
import { useId, useRef, useState } from 'react'
import { MoreHorizontal, Plus } from 'lucide-react'
import { DateField } from '@/components/ui/date-field'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { ConfirmDelete } from '@/components/ui/confirm-delete'
import { FIELD } from '@/components/ui/field'
import { FieldError, useFieldErrors } from '@/components/ui/field-error'
import { Menu } from '@/components/ui/menu'
import { Segmented } from '@/components/ui/segmented'
import { useToast } from '@/components/ui/toast'
import { settle } from '@/lib/settle'
import { deleteBillAction, markBillAction, recordBillAction, setBillingAction } from '../clients/actions'
import { switchStoreAction as switchTo } from '@/app/choose/actions'

// =============================================================================
// FILE: _components/bills.tsx — the partner's own bills on a client's page (P2, mockup v2 frames 4, 9–13): Mark paid with
// Undo, a bill's More (Mark unpaid, Delete bill), Record bill and Change billing. Words come from the server; a refusal
// stays in its dialog, a field's mistake at the field (§ Feedback 1–4).
// =============================================================================


/** Mark paid on an unpaid bill; the toast's Undo marks it unpaid again. */
export function MarkPaid({ linkId, billId, name, amount }: { linkId: string; billId: string; name: string; amount: string }) {
  const router = useRouter(), toast = useToast()
  const [busy, setBusy] = useState(false)
  const mark = async () => {
    setBusy(true)
    const r = await markBillAction({ linkId, billId, paid: true, name, amount })
    setBusy(false)
    if (!r.ok) { toast.error(r.error ?? 'We couldn’t save that. Nothing was changed.'); return }
    toast.ok(r.text, { undo: async () => { const u = await markBillAction({ linkId, billId, paid: false, name, amount }); settle(router); return u.ok ? { ok: true } : { ok: false, error: u.error } } })
    settle(router)
  }
  return <Button variant="secondary" size="sm" busy={busy} onClick={mark}>Mark paid</Button>
}

/** A bill's More: Mark unpaid (a paid bill) and Delete bill, which asks first. */
export function BillMore({ linkId, billId, name, amount, paid }: { linkId: string; billId: string; name: string; amount: string; paid: boolean }) {
  const router = useRouter(), toast = useToast()
  const [ask, setAsk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const unpaid = async () => {
    const r = await markBillAction({ linkId, billId, paid: false, name, amount })
    if (!r.ok) { toast.error(r.error ?? 'We couldn’t save that. Nothing was changed.'); return }
    toast.ok(r.text, { undo: async () => { const u = await markBillAction({ linkId, billId, paid: true, name, amount }); settle(router); return u.ok ? { ok: true } : { ok: false, error: u.error } } })
    settle(router)
  }
  const remove = async () => {
    setBusy(true); setError(null)
    const r = await deleteBillAction({ linkId, billId })
    setBusy(false)
    if (!r.ok) { setError(r.error ?? 'We couldn’t delete that. Nothing was changed.'); return }
    setAsk(false); toast.ok(r.text); settle(router)
  }
  return (
    <>
      <Menu label={`More for ${name}`} variant="ghost" size="sm" icon={<MoreHorizontal aria-hidden="true" className="size-4" />}
        items={[...(paid ? [{ label: 'Mark unpaid', onSelect: unpaid }] : []), { label: 'Delete bill', danger: true, onSelect: () => { setError(null); setAsk(true) } }]} />
      <ConfirmDelete open={ask} count={1} noun={['bill', 'bills']} consequence={`${name} · ${amount}. You can’t get it back.`} keep="Keep the bill"
        onConfirm={remove} onClose={() => setAsk(false)} error={error} busy={busy} />
    </>
  )
}

/** Record bill: filled from the billing (label, amount, the next bill's day); the only mistake left is a typed one. */
export function RecordBill({ linkId, store, fill, today, startOpen = false, primary = false }: { linkId: string; store: string
  fill: { label: string; amount: string; dueOn: string }; today: string; startOpen?: boolean; primary?: boolean }) {
  const router = useRouter(), toast = useToast(), id = useId()
  const [open, setOpen] = useState(startOpen)
  const [v, setV] = useState({ ...fill, number: '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const fields = useFieldErrors({ scope: formRef })
  const save = async (e?: React.FormEvent) => {
    e?.preventDefault(); setBusy(true); setError(null)
    const r = await recordBillAction({ linkId, ...v })
    setBusy(false)
    if (!r.ok) { if (r.fields) fields.set(r.fields as Record<string, string>); else setError(r.error ?? null); return }
    setOpen(false); toast.ok(r.text); settle(router)
  }
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => { setV({ ...v, [k]: e.target.value }); fields.clear(k); setError(null) }
  return (
    <>
      <Button variant={primary ? 'primary' : 'secondary'} size={primary ? undefined : 'sm'} onClick={() => { setV({ ...fill, number: '' }); fields.set({}); setError(null); setOpen(true) }}>{primary ? null : <Plus aria-hidden="true" className="size-4" />}Record bill</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Record bill · ${store}`} error={error}
        actions={<><Button variant="secondary" data-autofocus onClick={() => setOpen(false)}>Don’t record</Button><Button type="submit" form={`${id}-f`} busy={busy}>Record bill</Button></>}>
        <form id={`${id}-f`} ref={formRef} onSubmit={save} noValidate className="grid gap-3">
          <Field id={`${id}-label`} name="label" label="Bill for" fields={fields}><input id={`${id}-label`} value={v.label} maxLength={60} onChange={set('label')} {...fields.props('label')} className={`${FIELD} w-full`} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id={`${id}-amount`} name="amount" label="Amount (₹)" fields={fields}><input id={`${id}-amount`} inputMode="decimal" value={v.amount} onChange={set('amount')} {...fields.props('amount')} className={`${FIELD} w-full font-num`} /></Field>
            <Field name="dueOn" label="Due" fields={fields}><DateField label="Due" value={v.dueOn || null} today={today} onChange={(k) => { setV({ ...v, dueOn: k }); fields.clear('dueOn'); setError(null) }} /></Field>
          </div>
          <Field id={`${id}-number`} name="number" label="Bill number (optional)" fields={fields}><input id={`${id}-number`} value={v.number} maxLength={20} autoComplete="off" onChange={set('number')} {...fields.props('number')} className={`${FIELD} w-full font-mono`} /></Field>
        </form>
      </Dialog>
    </>
  )
}

/** Change billing: a retainer asks its amount a month and the next bill's day; a project its amount. */
export function ChangeBilling({ linkId, store, deal, today }: { linkId: string; store: string; deal: { kind: 'project' | 'retainer'; amount: string; renewsOn: string }; today: string }) {
  const router = useRouter(), toast = useToast(), id = useId()
  const [open, setOpen] = useState(false)
  const [v, setV] = useState(deal)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const fields = useFieldErrors({ scope: formRef })
  const save = async (e?: React.FormEvent) => {
    e?.preventDefault(); setBusy(true); setError(null)
    const r = await setBillingAction({ linkId, kind: v.kind, amount: v.amount, renewsOn: v.kind === 'retainer' ? v.renewsOn : null })
    setBusy(false)
    if (!r.ok) { if (r.fields) fields.set(r.fields as Record<string, string>); else setError(r.error ?? null); return }
    setOpen(false); toast.ok(r.text); settle(router)
  }
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => { setV(deal); fields.set({}); setError(null); setOpen(true) }}>{deal.amount ? 'Change billing' : 'Set billing'}</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Change billing · ${store}`} error={error}
        actions={<><Button variant="secondary" data-autofocus onClick={() => setOpen(false)}>Keep billing</Button><Button type="submit" form={`${id}-f`} busy={busy}>Save billing</Button></>}>
        <form id={`${id}-f`} ref={formRef} onSubmit={save} noValidate className="grid gap-3">
          <div className="grid gap-1.5"><span className="text-label font-medium" aria-hidden="true">Billed as</span>
            <Segmented className="justify-self-start" label="Billed as" value={v.kind} options={[['retainer', 'Retainer'], ['project', 'Project']] as const} onPick={(k) => setV({ ...v, kind: k })} /></div>
          <div className={`grid gap-3 ${v.kind === 'retainer' ? 'sm:grid-cols-2' : ''}`}>
            <Field id={`${id}-amount`} name="amount" label={v.kind === 'retainer' ? 'Amount a month (₹)' : 'Amount (₹)'} fields={fields}><input id={`${id}-amount`} inputMode="decimal" value={v.amount} onChange={(e) => { setV({ ...v, amount: e.target.value }); fields.clear('amount') }} {...fields.props('amount')} className={`${FIELD} w-full font-num`} /></Field>
            {v.kind === 'retainer' && <Field name="dueOn" label="Next bill" fields={fields}><DateField label="Next bill" value={v.renewsOn || null} today={today} onChange={(k) => { setV({ ...v, renewsOn: k }); fields.clear('dueOn') }} /></Field>}
          </div>
        </form>
      </Dialog>
    </>
  )
}

/** A label over its field and the field's mistake under it; a day field names itself (its button says "Due: 1 Dec"). */
function Field({ id, name, label, fields, children }: { id?: string; name: string; label: string; fields: ReturnType<typeof useFieldErrors>; children: React.ReactNode }) {
  return <div className="grid gap-1.5">{id ? <label htmlFor={id} className="text-label font-medium">{label}</label> : <span aria-hidden="true" className="text-label font-medium">{label}</span>}{children}<FieldError name={name} message={fields.errors[name]} /></div>
}

/** More on a client's page: open the store on Content or on Website keys (a store switch, then that page). */
export function StoreMore({ tenantId }: { tenantId: string }) {
  const content = useRef<HTMLFormElement>(null), keys = useRef<HTMLFormElement>(null)
  return (
    <>
      <Menu items={[{ label: 'Edit content', onSelect: () => content.current?.requestSubmit() }, { label: 'Website keys', onSelect: () => keys.current?.requestSubmit() }]} />
      <OpenAt refEl={content} tenantId={tenantId} to="/console/content" />
      <OpenAt refEl={keys} tenantId={tenantId} to="/console/settings/website" />
    </>
  )
}
function OpenAt({ refEl, tenantId, to }: { refEl: React.RefObject<HTMLFormElement | null>; tenantId: string; to: string }) {
  return <form ref={refEl} action={switchTo} hidden><input type="hidden" name="tenantId" value={tenantId} /><input type="hidden" name="to" value={to} /></form>
}
