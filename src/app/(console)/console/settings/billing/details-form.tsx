'use client'

import { useRef, useState, useTransition } from 'react'
import { Section } from '@/components/layout/section'
import { Button } from '@/components/ui/button'
import { FieldError, fieldProps, useErrorSummary } from '@/components/ui/field-error'
import { useToast } from '@/components/ui/toast'
import { saveBillingDetails } from './actions'
import { FIELD_BOX } from '@/components/ui/field'

type Details = { legalName: string; gstin: string; address: string; stateCode: string; email: string; saved: boolean }

/** Billing details (billing B1): who Frrata's invoices are made out to. Prefilled from Store details until saved. */
export function BillingDetailsForm({ initial, states }: { initial: Details; states: string[][] }) {
  const [v, setV] = useState(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const toast = useToast()
  const formRef = useRef<HTMLFormElement>(null)
  const [attempt, setAttempt] = useState(0)
  useErrorSummary(errors, { attempt, scope: formRef })
  const [pending, start] = useTransition()
  const set = (k: keyof Details, x: string) => { setV((d) => ({ ...d, [k]: x })); setErrors(({ [k]: _, ...rest }) => rest) }
  const save = () => start(async () => {
    const r = await saveBillingDetails(v)
    if (r.ok) { setErrors({}); toast.ok('Saved.'); return }
    const fields = r.errors ?? {}
    setErrors(fields)
    if (Object.keys(fields).length) setAttempt((n) => n + 1); else toast.error(r.error)
  })
  const field = `${FIELD_BOX} w-full`
  const err = (k: string) => <FieldError name={`b-${k}`} message={errors[k]} />
  const a = (k: string) => ({ id: `b-${k}`, ...fieldProps(`b-${k}`, errors[k]) })
  return (
    <Section>
      <h2 className="text-section font-semibold">Billing details</h2>
      <form ref={formRef} className="grid gap-3 sm:grid-cols-2" noValidate onSubmit={(e) => { e.preventDefault(); save() }}>
        <div className="space-y-1 sm:col-span-2"><label htmlFor="b-legalName" className="text-sm font-medium">Legal name</label><input {...a('legalName')} value={v.legalName} maxLength={200} onChange={(e) => set('legalName', e.target.value)} className={`${field} h-11 md:h-9`} />{err('legalName')}</div>
        <div className="space-y-1"><label htmlFor="b-gstin" className="text-sm font-medium">GSTIN <span className="font-normal text-muted-foreground">(optional)</span></label><input {...a('gstin')} value={v.gstin} maxLength={15} autoCapitalize="characters" onChange={(e) => set('gstin', e.target.value)} className={`${field} h-11 font-mono md:h-9`} />{err('gstin')}</div>
        <div className="space-y-1"><label htmlFor="b-stateCode" className="text-sm font-medium">State</label><select {...a('stateCode')} value={v.stateCode} onChange={(e) => set('stateCode', e.target.value)} className={`${field} h-11 md:h-9`}><option value="">Choose…</option>{states.map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select>{err('stateCode')}</div>
        <div className="space-y-1 sm:col-span-2"><label htmlFor="b-address" className="text-sm font-medium">Billing address</label><textarea {...a('address')} rows={3} maxLength={400} value={v.address} onChange={(e) => set('address', e.target.value)} className={`${field} py-2`} />{err('address')}</div>
        <div className="space-y-1 sm:col-span-2"><label htmlFor="b-email" className="text-sm font-medium">Billing email</label><input {...a('email')} type="email" inputMode="email" value={v.email} onChange={(e) => set('email', e.target.value)} className={`${field} h-11 md:h-9`} />{err('email')}</div>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" aria-disabled={pending}>{pending ? 'Saving…' : 'Save billing details'}</Button>
        </div>
      </form>
    </Section>
  )
}
