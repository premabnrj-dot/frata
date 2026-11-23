'use client'

import { useId, useState } from 'react'
import { FieldMessage } from '@/components/ui/action-form'
import { DateField } from '@/components/ui/date-field'
import { FIELD } from '@/components/ui/field'
import { Segmented } from '@/components/ui/segmented'
import { Switch } from '@/components/ui/switch'
import { UnitField } from '@/components/ui/unit-field'
import { CADENCE_WORDS, CATEGORY_WORDS, COST_CADENCES, COST_CATEGORIES, type CostCategory, type CostCurrency } from '@/domains/admin/costs'
import type { CostFacts, PaidTarget } from './forms'

// =============================================================================
// FILE: src/app/(admin)/admin/costs/_components/fields.tsx — the FIELDS inside Admin › Costs' dialogs (mockup § Add, § Mark
// paid). Loaded only when a dialog opens (next/dynamic in forms.tsx): the date picker, the switch and the segmented choice
// stay out of the page's first-load script (Admin's 150 kB budget).
// =============================================================================

const SYMBOL: Record<CostCurrency, string> = { INR: 'INR', USD: 'USD' } // as drawn: the currency in words
// The mistake sits beside the label, never inside it: a field's name stays "Name", not "Name Add a name.".
const Row = ({ label, name, children }: { label: string; name: string; children: React.ReactNode }) => (
  <div className="flex min-w-0 flex-col gap-1 text-sm"><label className="flex min-w-0 flex-col gap-1"><span className="font-medium">{label}</span>{children}</label><FieldMessage name={name} /></div>
)
const categoryOptions = COST_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_WORDS[c]}</option>)

function Day({ label, name, value, today, max }: { label: string; name: string; value: string; today: string; max?: string }) {
  const [day, setDay] = useState(value)
  return (
    <div className="flex min-w-0 flex-col gap-1 text-sm"><span aria-hidden="true" className="font-medium">{label}</span>
      <input type="hidden" name={name} value={day} /><DateField label={label} value={day} onChange={setDay} today={today} {...(max ? { max } : {})} /><FieldMessage name={name} /></div>
  )
}

function Money({ name, label, currency, defaultValue, autoFocus, placeholder }: { name: string; label: string; currency: CostCurrency; defaultValue?: string; autoFocus?: boolean; placeholder?: string }) {
  return <Row label={label} name={name}><UnitField unit={SYMBOL[currency]} name={name} inputMode="decimal" autoComplete="off" defaultValue={defaultValue} placeholder={placeholder} data-autofocus={autoFocus ? '' : undefined} /></Row>
}

function Varies({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  const id = useId()
  return <div className="flex items-center gap-2.5 text-sm"><Switch id={id} on={on} onChange={onChange} /><label htmlFor={id}>Amount changes each time</label></div>
}

/** Amount with its currency as the prefix (as drawn): the currency choice is part of the field. */
function AmountField({ currency, onCurrency }: { currency: CostCurrency; onCurrency: (c: CostCurrency) => void }) {
  return (
    <Row label="Amount" name="amount">
      <span className="flex">
        <select aria-label="Currency" name="currency" value={currency} onChange={(e) => onCurrency(e.target.value as CostCurrency)} className={`${FIELD} w-20 shrink-0 rounded-r-none border-r-0 bg-sunk`}><option value="INR">INR</option><option value="USD">USD</option></select>
        <input name="amount" inputMode="decimal" autoComplete="off" className={`${FIELD} w-full min-w-0 rounded-l-none font-num`} />
      </span>
    </Row>
  )
}

// ── Add a cost ──────────────────────────────────────────────────────────────────────────────────────────────────────

export function AddFields({ today, starter }: { today: string; starter: { name: string; category: CostCategory } | null }) {
  const [kind, setKind] = useState<'recurring' | 'one_time'>('recurring')
  const [currency, setCurrency] = useState<CostCurrency>('INR')
  const [varies, setVaries] = useState(false)
  return (
    <>
      <input type="hidden" name="kind" value={kind} /><input type="hidden" name="varies" value={varies ? 'on' : 'off'} />
      <Segmented label="Type" value={kind} options={[['recurring', 'Repeats'], ['one_time', 'Once']]} onPick={setKind} className="self-start" />
      <Row label="Name" name="name"><input name="name" maxLength={80} autoComplete="off" defaultValue={starter?.name ?? ''} className={FIELD} data-autofocus="" /></Row>
      <div className="grid gap-3 sm:grid-cols-2">
        <Row label="Vendor" name="vendor"><input name="vendor" maxLength={80} autoComplete="off" placeholder="Optional" className={FIELD} /></Row>
        <Row label="Category" name="category"><select name="category" defaultValue={starter?.category ?? 'software'} className={FIELD}>{categoryOptions}</select></Row>
      </div>
      {kind === 'one_time' ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2"><AmountField currency={currency} onCurrency={setCurrency} /><Day label="Paid on" name="paidOn" value={today} today={today} max={today} /></div>
          <div className="grid gap-3 sm:grid-cols-2">{currency === 'USD' ? <Money name="inr" label="Paid in rupees" currency="INR" /> : null}<Money name="gst" label="GST included" currency="INR" placeholder="Optional" /></div>
        </>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <AmountField currency={currency} onCurrency={setCurrency} />
            <Row label="Repeats" name="cadence"><select name="cadence" defaultValue="monthly" className={FIELD}>{COST_CADENCES.map((c) => <option key={c} value={c}>{CADENCE_WORDS[c]}</option>)}</select></Row>
          </div>
          <Day label="Next due on" name="anchorOn" value={today} today={today} />
          <Varies on={varies} onChange={setVaries} />
        </>
      )}
    </>
  )
}


/** Mark paid's fields, in the drawn order: a cost that varies opens on the amount. */
export function PaidFields({ t }: { t: PaidTarget }) {
  return (
    <>
      <input type="hidden" name="itemId" value={t.itemId} /><input type="hidden" name="periodFor" value={t.period} /><input type="hidden" name="currency" value={t.currency} />
      {t.varies ? <Money name="amount" label="Billed" currency={t.currency} autoFocus /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Day label="Paid on" name="paidOn" value={t.today} today={t.today} max={t.today} />
        {t.varies
          ? (t.currency === 'USD' ? <Money name="inr" label="Left your account" currency="INR" defaultValue={t.inr} /> : <Money name="gst" label="GST included" currency="INR" placeholder="Optional" />)
          : <div className="flex min-w-0 flex-col gap-1 text-sm"><span className="font-medium">For the bill due</span><div className={`${FIELD} flex items-center bg-sunk font-num`}>{t.periodText}</div></div>}
      </div>
      {t.varies ? null : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Money name="amount" label="Billed" currency={t.currency} defaultValue={t.amount} />
          {t.currency === 'USD' ? <Money name="inr" label="Left your account" currency="INR" defaultValue={t.inr} /> : <Money name="gst" label="GST included" currency="INR" placeholder="Optional" />}
        </div>
      )}
      {t.currency === 'USD' ? <Money name="gst" label="GST included" currency="INR" placeholder="Optional" /> : null}
    </>
  )
}

export function DetailsFields({ c }: { c: CostFacts }) {
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


export function AmountChangeFields({ c }: { c: CostFacts }) {
  return <><input type="hidden" name="itemId" value={c.id} /><input type="hidden" name="currency" value={c.currency} /><Money name="amount" label="Amount" currency={c.currency} defaultValue={c.amount} autoFocus /></>
}

export function ScheduleFields({ c, today }: { c: CostFacts; today: string }) {
  return (
    <>
      <input type="hidden" name="itemId" value={c.id} />
      {c.paid ? null : <Row label="Repeats" name="cadence"><select name="cadence" defaultValue={c.cadence ?? 'monthly'} className={FIELD}>{COST_CADENCES.map((k) => <option key={k} value={k}>{CADENCE_WORDS[k]}</option>)}</select></Row>}
      <Day label="Next due on" name="anchorOn" value={c.anchorOn} today={today} />
    </>
  )
}

export function EndFields({ c, today }: { c: CostFacts; today: string }) {
  return <><input type="hidden" name="itemId" value={c.id} /><Day label="Last day" name="endsOn" value={today} today={today} /></>
}
