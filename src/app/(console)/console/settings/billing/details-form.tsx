'use client'

import { useState, useTransition } from 'react'
import { Section } from '@/components/layout/section'
import { Button } from '@/components/ui/button'
import { saveBillingDetails } from './actions'

type Details = { legalName: string; gstin: string; address: string; stateCode: string; email: string; saved: boolean }

/** Billing details (billing B1): who Frrata's invoices are made out to. Prefilled from Store details until saved. */
export function BillingDetailsForm({ initial, states }: { initial: Details; states: string[][] }) {
  const [v, setV] = useState(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()
  const set = (k: keyof Details, x: string) => { setV((d) => ({ ...d, [k]: x })); setErrors(({ [k]: _, ...rest }) => rest); setMessage(null) }
  const save = () => start(async () => {
    const r = await saveBillingDetails(v)
    if (r.ok) { setErrors({}); setMessage({ ok: true, text: 'Saved.' }); return }
    setErrors(r.errors ?? {}); setMessage({ ok: false, text: r.error })
  })
  const field = 'w-full rounded-md border border-input bg-card px-3 text-sm aria-invalid:border-danger-text'
  const err = (k: string) => errors[k] ? <p id={`b-${k}-e`} className="text-xs text-danger-text">{errors[k]}</p> : null
  const a = (k: string) => ({ id: `b-${k}`, 'aria-invalid': !!errors[k] || undefined, 'aria-describedby': errors[k] ? `b-${k}-e` : undefined })
  return (
    <Section>
      <h2 className="text-section font-semibold">Billing details</h2>
      <form className="grid gap-3 sm:grid-cols-2" noValidate onSubmit={(e) => { e.preventDefault(); save() }}>
        <div className="space-y-1 sm:col-span-2"><label htmlFor="b-legalName" className="text-sm font-medium">Legal name</label><input {...a('legalName')} value={v.legalName} maxLength={200} onChange={(e) => set('legalName', e.target.value)} className={`${field} h-10 md:h-9`} />{err('legalName')}</div>
        <div className="space-y-1"><label htmlFor="b-gstin" className="text-sm font-medium">GSTIN <span className="font-normal text-muted-foreground">(optional)</span></label><input {...a('gstin')} value={v.gstin} maxLength={15} autoCapitalize="characters" onChange={(e) => set('gstin', e.target.value)} className={`${field} h-10 font-mono md:h-9`} />{err('gstin')}</div>
        <div className="space-y-1"><label htmlFor="b-stateCode" className="text-sm font-medium">State</label><select {...a('stateCode')} value={v.stateCode} onChange={(e) => set('stateCode', e.target.value)} className={`${field} h-10 md:h-9`}><option value="">Choose…</option>{states.map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select>{err('stateCode')}</div>
        <div className="space-y-1 sm:col-span-2"><label htmlFor="b-address" className="text-sm font-medium">Billing address</label><textarea {...a('address')} rows={3} maxLength={400} value={v.address} onChange={(e) => set('address', e.target.value)} className={`${field} py-2`} />{err('address')}</div>
        <div className="space-y-1 sm:col-span-2"><label htmlFor="b-email" className="text-sm font-medium">Billing email</label><input {...a('email')} type="email" inputMode="email" value={v.email} onChange={(e) => set('email', e.target.value)} className={`${field} h-10 md:h-9`} />{err('email')}</div>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" aria-disabled={pending}>{pending ? 'Saving…' : 'Save billing details'}</Button>
          {message && <p role={message.ok ? 'status' : 'alert'} className={`text-sm ${message.ok ? 'text-ok-text' : 'text-danger-text'}`}>{message.text}</p>}
        </div>
      </form>
    </Section>
  )
}
