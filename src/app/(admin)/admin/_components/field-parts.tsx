'use client'

import { useState } from 'react'
import { FieldMessage } from '@/components/ui/action-form'
import { DateField } from '@/components/ui/date-field'
import { UnitField } from '@/components/ui/unit-field'

// =============================================================================
// FILE: src/app/(admin)/admin/_components/field-parts.tsx — THE SMALL FIELDS Admin's money dialogs share (Costs, Cashflow): a labelled row whose mistake sits
// BESIDE its label (a field's name stays "Name", not "Name Add a name."), a day through the shared date field, and an amount with its currency in words.
// =============================================================================

export const Row = ({ label, name, children }: { label: string; name: string; children: React.ReactNode }) => (
  <div className="flex min-w-0 flex-col gap-1 text-sm"><label className="flex min-w-0 flex-col gap-1"><span className="font-medium">{label}</span>{children}</label><FieldMessage name={name} /></div>
)

export function Day({ label, name, value, today, max, onChange }: { label: string; name: string; value: string; today: string; max?: string; onChange?: (day: string) => void }) {
  const [day, setDay] = useState(value)
  return (
    <div className="flex min-w-0 flex-col gap-1 text-sm"><span aria-hidden="true" className="font-medium">{label}</span>
      <input type="hidden" name={name} value={day} /><DateField label={label} value={day} onChange={(d) => { setDay(d); onChange?.(d) }} today={today} {...(max ? { max } : {})} /><FieldMessage name={name} /></div>
  )
}

export function Money({ name, label, unit = 'INR', defaultValue, autoFocus, placeholder, value, onChange }: {
  name: string; label: string; unit?: string; defaultValue?: string; autoFocus?: boolean; placeholder?: string; value?: string; onChange?: (v: string) => void
}) {
  return (
    <Row label={label} name={name}>
      <UnitField unit={unit} name={name} inputMode="decimal" autoComplete="off" placeholder={placeholder} data-autofocus={autoFocus ? '' : undefined}
        {...(value !== undefined ? { value, onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange?.(e.target.value) } : { defaultValue })} />
    </Row>
  )
}
