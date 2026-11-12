'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { InfoTip } from '@/components/ui/info-tip'
import { FieldError, useErrorSummary } from '@/components/ui/field-error'
import { useToast } from '@/components/ui/toast'
import { BRANDS_NOW, PARTNER_SERVICES, PARTNER_TERMS } from '@/domains/partners/terms'
import { applyAction } from './actions'

type Values = { name: string; businessName: string; phone: string; city: string; services: string[]; workUrl: string; brandsNow: string; agree: boolean }

/** The application: seven short fields and the terms. Explanations sit in (i) tips; errors stay under their field. */
export function ApplyForm({ initial }: { initial?: Partial<Values> }) {
  const router = useRouter()
  const [v, setV] = useState<Values>({ name: '', businessName: '', phone: '', city: '', services: [], workUrl: '', brandsNow: '', agree: false, ...initial })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [attempt, setAttempt] = useState(0)
  const toast = useToast()
  const formRef = useRef<HTMLFormElement>(null)
  useErrorSummary(errors, { attempt, scope: formRef })
  const [pending, start] = useTransition()
  const set = <K extends keyof Values>(k: K, x: Values[K]) => { setV((o) => ({ ...o, [k]: x })); setErrors((e) => ({ ...e, [k]: '' })) }
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    start(async () => {
      const r = await applyAction(v)
      // Field mistakes at their fields with one quiet summary; a refusal with none is a toast (§ Feedback).
      if (!r.ok) { const e = r.errors ?? {}; setErrors(e); if (Object.values(e).some(Boolean)) setAttempt((a) => a + 1); else if (r.error) toast.error(r.error); return }
      router.refresh()
    })
  }
  const input = 'h-10 w-full rounded-md border border-input bg-card px-3 text-sm aria-invalid:border-danger-text md:h-9'
  const err = (k: string) => <FieldError id={`${k}-msg`} message={errors[k]} className="text-sm" />
  const text = (k: 'name' | 'businessName' | 'phone' | 'city' | 'workUrl', label: React.ReactNode, extra?: React.InputHTMLAttributes<HTMLInputElement>, tip?: React.ReactNode) => (
    <div className="space-y-1.5">
      <div className="flex items-center"><label htmlFor={k} className="text-sm font-medium">{label}</label>{tip}</div>
      <input id={k} value={v[k]} onChange={(e) => set(k, e.target.value)} aria-invalid={!!errors[k] || undefined} aria-describedby={errors[k] ? `${k}-msg` : undefined} className={input} {...extra} />
      {err(k)}
    </div>
  )
  const chip = (on: boolean) => `inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-3 text-sm md:min-h-9 ${on ? 'border-2 border-primary font-medium' : 'border border-input'}`
  return (
    <form ref={formRef} onSubmit={submit} noValidate className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {text('name', 'Your name', { autoComplete: 'name', autoFocus: true })}
        {text('businessName', <>Studio name<span className="ml-1 font-normal text-muted-foreground">(optional)</span></>, { autoComplete: 'organization' })}
        {text('phone', 'WhatsApp number', { inputMode: 'tel', autoComplete: 'tel', placeholder: '98450 12345', className: `${input} font-mono` })}
        {text('city', 'City', { autoComplete: 'address-level2' })}
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">What you do</legend>
        <div className="flex flex-wrap gap-2">
          {PARTNER_SERVICES.map(([k, label]) => (
            <label key={k} className={chip(v.services.includes(k))}>
              <input type="checkbox" checked={v.services.includes(k)} onChange={(e) => set('services', e.target.checked ? [...v.services, k] : v.services.filter((s) => s !== k))} className="size-4" />{label}
            </label>
          ))}
        </div>
      </fieldset>
      {text('workUrl', 'Your work', { inputMode: 'url', placeholder: 'instagram.com/yourstudio' }, <InfoTip about="your work">A shop you built, your site or your Instagram. One link is enough.</InfoTip>)}
      <fieldset className="space-y-2" aria-describedby={errors.brandsNow ? 'brandsNow-msg' : undefined}>
        <legend className="text-sm font-medium">Brands you work with now</legend>
        <div className="flex flex-wrap gap-2">
          {BRANDS_NOW.map(([k, label]) => (
            <label key={k} className={chip(v.brandsNow === k)}>
              <input type="radio" name="brandsNow" checked={v.brandsNow === k} onChange={() => set('brandsNow', k)} className="size-4" />{label}
            </label>
          ))}
        </div>
        {err('brandsNow')}
      </fieldset>
      <div className="space-y-1.5">
        <div className="flex items-start gap-2.5 text-sm">
          <input id="agree" type="checkbox" checked={v.agree} onChange={(e) => set('agree', e.target.checked)} aria-invalid={!!errors.agree || undefined} className="mt-0.5 size-4" />
          <span><label htmlFor="agree">I agree to the partner terms</label><InfoTip about="the partner terms">{PARTNER_TERMS.shareBps / 100}% of what Frrata collects from each store you build, for {PARTNER_TERMS.shareMonths} months from its opening. The brand owns its store and can remove you. You never copy shoppers’ details for your own use.</InfoTip></span>
        </div>
        {err('agree')}
      </div>
      <Button type="submit" size="lg" disabled={pending}>{pending ? 'Sending…' : 'Send application'}</Button>
    </form>
  )
}
