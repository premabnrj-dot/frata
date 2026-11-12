'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { PageHeader } from '@/components/layout/page-header'
import { Section } from '@/components/layout/section'
import { Button } from '@/components/ui/button'
import { FieldError, errorId, useErrorSummary } from '@/components/ui/field-error'
import { useToast } from '@/components/ui/toast'
import { saveShipCosts } from '../actions'

// The three costs (Ship S·0, call S3). Unconfirmed, they start at what a 0.5 kg parcel usually costs; saving them is
// confirming them. Whole rupees: the server checks again and stores paise.

type Key = 'delivery' | 'ret' | 'cod'
const FIELDS: { key: Key; label: string; hint: string; suggested: string }[] = [
  { key: 'delivery', label: 'A delivery', hint: 'Courier charge to deliver one parcel', suggested: '70' },
  { key: 'ret', label: 'A return', hint: 'Charged when a parcel comes back undelivered', suggested: '70' },
  { key: 'cod', label: 'A COD fee', hint: 'The courier’s fee for collecting cash on a delivered COD order: about ₹50 (one flat figure)', suggested: '50' },
]

export function ShipCostsForm({ current, confirmedOn: confirmed0 }: { current: Record<Key, string | null>; confirmedOn: string | null }) {
  const router = useRouter()
  const start0 = (k: Key, s: string) => current[k] ?? s
  const [v, setV] = useState<Record<Key, string>>(() => Object.fromEntries(FIELDS.map((f) => [f.key, start0(f.key, f.suggested)])) as Record<Key, string>)
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({})
  const toast = useToast()
  const box = useRef<HTMLDivElement>(null)
  const [attempt, setAttempt] = useState(0)
  useErrorSummary(errors, { attempt, scope: box })
  const [pending, start] = useTransition()
  const [confirmedOn, setConfirmedOn] = useState(confirmed0)
  const [saved, setSaved] = useState<Record<Key, string | null>>(current)
  const changed = !confirmedOn || FIELDS.some((f) => v[f.key] !== saved[f.key])
  const field = 'h-11 w-full min-w-0 bg-transparent text-sm tabular-nums outline-none md:h-9'

  return (
    <div className="max-w-xl space-y-4">
      <PageHeader title="Shipping costs" back={{ href: '/console/settings', label: 'Settings' }} />
      <p className="text-sm text-muted-foreground">For orders you ship another way: a local courier, or your own Shiprocket panel. Profit on those orders uses these. Orders shipped with Shiprocket through Frrata use what was actually charged.</p>
      <Section>
        <p className={`text-sm ${confirmedOn ? 'text-muted-foreground' : 'text-warn-text'}`} aria-live="polite">
          {confirmedOn ? `Confirmed on ${confirmedOn}. Profit on those orders is estimated from these.` : 'Not confirmed yet: profit on those orders says “before shipping costs”. The figures below are what a 0.5 kg parcel usually costs.'}
        </p>
        <div ref={box} className="grid gap-3 sm:grid-cols-3">
          {FIELDS.map((f) => (
            <div key={f.key} className="space-y-1">
              <label htmlFor={`cost-${f.key}`} className="block text-sm font-medium">{f.label}</label>
              <div className={`flex items-center gap-1 rounded-md border bg-card px-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring ${errors[f.key] ? 'border-danger-mark' : 'border-input'}`}>
                <span className="text-sm text-muted-foreground" aria-hidden>₹</span>
                <input id={`cost-${f.key}`} inputMode="numeric" value={v[f.key]} disabled={pending} maxLength={6}
                  aria-describedby={errors[f.key] ? errorId(`cost-${f.key}`) : `cost-${f.key}-h`} aria-invalid={!!errors[f.key] || undefined}
                  onChange={(e) => { setV({ ...v, [f.key]: e.target.value.replace(/[^\d]/g, '') }); setErrors({ ...errors, [f.key]: undefined }) }}
                  className={field} />
              </div>
              {errors[f.key] ? <FieldError name={`cost-${f.key}`} message={errors[f.key]} /> : <p id={`cost-${f.key}-h`} className="text-xs text-muted-foreground">{f.hint}</p>}
            </div>
          ))}
        </div>
        <div>
          <Button type="button" disabled={!changed || pending} onClick={() => start(async () => {
            let r: Awaited<ReturnType<typeof saveShipCosts>>
            try { r = await saveShipCosts(v) } catch { r = { ok: false, error: 'We could not save. Check your connection; nothing was changed.' } }
            if (r.ok) { toast.ok('Shipping costs confirmed.'); setConfirmedOn(r.confirmedOn); setSaved(v); router.refresh() }
            else {
              const fields = (r.errors ?? {}) as Partial<Record<Key, string>>
              setErrors(fields)
              if (Object.keys(fields).length) setAttempt((n) => n + 1); else toast.error(r.error)
            }
          })}>{pending ? 'Saving…' : confirmedOn ? 'Save these costs' : 'Confirm these costs'}</Button>
        </div>
      </Section>
    </div>
  )
}
