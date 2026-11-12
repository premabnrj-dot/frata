'use client'

import { SELL_LABELS, type SellKey } from '@/domains/catalogue/sell-keys'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { PINCODE_SHAPE, slugFor, slugProblem } from '@/domains/signup/slug'
import { checkAddress, createMyShop, lookupPincode, sendSignupCode, verifySignupCode, type AddressCheck } from './actions'
import { FieldError, errorId, useErrorSummary } from '@/components/ui/field-error'
import { useToast } from '@/components/ui/toast'

type Step = 'name' | 'pickup' | 'plan' | 'phone' | 'sells'
/** A plan card as the sign-up shows it (prices with GST from the server; never a cost). */
export type SignupPlan = { code: string; name: string; price: string; included: string; fee: string }

const ADDRESS_WORDS: Record<AddressCheck['state'], string> = {
  ok: 'Available', taken: 'Taken. Try another.', too_short: 'At least 3 letters', shape: 'Letters, digits and hyphens only', reserved: 'Reserved. Try another.',
}

/** Shop name (address derived live) → pickup pincode → plan (trials TR1) → optional "what do you sell" → the console. */
export function CreateShopForm({ shopDomain, plans, trialDays, codeOn }: { shopDomain: string; plans: SignupPlan[]; trialDays: number; codeOn: boolean }) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('name')
  const [dir, setDir] = useState<'forward' | 'back'>('forward')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [address, setAddress] = useState<AddressCheck | null>(null)
  const [pickup, setPickup] = useState('')
  const [place, setPlace] = useState<{ city: string; state: string } | null | 'unknown'>(null)
  const [sells, setSells] = useState<string[]>([])
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [codeId, setCodeId] = useState<string | null>(null)
  const [verified, setVerified] = useState(false)
  const [plan, setPlan] = useState(plans.some((p) => p.code === 'growth') ? 'growth' : plans[0]?.code ?? 'launch')
  // A mistake in a field stays at it (§ Feedback 3: its line, focus, one quiet summary); a refusal that names no field
  // is a toast (§ Feedback 1).
  const [error, setError] = useState<{ field?: string; text: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const toast = useToast()
  const root = useRef<HTMLDivElement>(null)
  useErrorSummary(error?.field ? { [error.field]: error.text } : {}, { attempt, scope: root })
  const fail = (e: { field?: string; text: string }) => {
    if (e.field && ['name', 'slug', 'pickup', 'phone', 'code'].includes(e.field)) { setError(e); setAttempt((a) => a + 1) }
    else { setError(null); toast.error(e.text) }
  }
  const [pending, start] = useTransition()
  const flashKey = useRef(0)

  // Address availability, a moment after typing stops.
  useEffect(() => {
    if (!slug) { setAddress(null); return }
    const local = slugProblem(slug)
    if (local) { setAddress({ state: local }); return }
    const t = setTimeout(() => { checkAddress(slug).then(setAddress) }, 300)
    return () => clearTimeout(t)
  }, [slug])

  useEffect(() => {
    if (!PINCODE_SHAPE.test(pickup)) { setPlace(null); return }
    let live = true
    lookupPincode(pickup).then((p) => { if (live) { flashKey.current++; setPlace(p ?? 'unknown') } })
    return () => { live = false }
  }, [pickup])

  const go = (s: Step, d: 'forward' | 'back' = 'forward') => { setDir(d); setError(null); setStep(s) }

  function submit() {
    setError(null)
    start(async () => {
      const r = await createMyShop({ name, slug, pickup, sells, plan, codeId: verified ? codeId : null })
      if (r.ok || r.hasShop) { router.replace('/console'); router.refresh(); return }
      fail({ field: r.field, text: r.error })
      if (r.field === 'slug' || r.field === 'name') go('name', 'back')
      if (r.field === 'pickup') go('pickup', 'back')
      // A code verified too long ago: ask for a new one.
      if (r.field === 'phone') { setCodeId(null); setVerified(false); go('phone', 'back') }
    })
  }

  const anim = dir === 'forward' ? 'animate-step-forward' : 'animate-step-back'
  const steps = codeOn ? 5 : 4
  const stepNo = { name: 1, pickup: 2, plan: 3, phone: 4, sells: steps }[step]

  return (
    <div ref={root} className="space-y-5">
      <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className="h-full w-full origin-left bg-thread transition-transform duration-slow ease-standard" style={{ transform: `scaleX(${stepNo / steps})` }} />
      </div>
      <p className="text-xs text-muted-foreground">Step <span className="font-mono">{stepNo}</span> of <span className="font-mono">{steps}</span></p>

      {step === 'name' && (
        <form key="name" className={`space-y-4 ${anim}`} noValidate onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return fail({ field: 'name', text: 'Your shop needs a name. You can change it later.' })
          if (address?.state !== 'ok') return fail({ field: 'slug', text: address ? ADDRESS_WORDS[address.state] : 'Choose an address.' })
          go('pickup')
        }}>
          <h1 className="text-2xl font-semibold tracking-tight">What is your shop called?</h1>
          <div className="space-y-1.5">
            <label htmlFor="name" className="block text-sm font-medium">Shop name</label>
            <input id="name" autoFocus autoComplete="organization" maxLength={60} value={name} placeholder="Kesar Studio"
              aria-invalid={error?.field === 'name' || undefined} aria-describedby={error?.field === 'name' ? errorId('name') : undefined}
              onChange={(e) => { setName(e.target.value); setError(null); if (!slugEdited) setSlug(slugFor(e.target.value)) }}
              className="h-11 w-full rounded-md border border-input bg-card px-3 text-base aria-invalid:border-danger-text" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="slug" className="block text-sm font-medium">Shop address</label>
            <div className="flex items-center gap-1 rounded-md bg-muted px-3 py-2.5 font-mono text-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
              <input id="slug" value={slug} aria-describedby={error?.field === 'slug' ? `slug-state ${errorId('slug')}` : 'slug-state'} aria-invalid={error?.field === 'slug' || undefined}
                onChange={(e) => { setSlugEdited(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30)); setError(null) }}
                className="min-w-0 flex-1 bg-transparent outline-none" style={{ maxWidth: `${Math.max(4, slug.length + 1)}ch` }} />
              <span className="text-muted-foreground">.{shopDomain}</span>
            </div>
            <p id="slug-state" aria-live="polite" className={`min-h-5 text-sm ${address?.state === 'ok' ? 'text-ok-text' : address ? 'text-warn-text' : 'text-muted-foreground'}`}>
              {address ? ADDRESS_WORDS[address.state] : 'Made from the name. You can edit it.'}
            </p>
          </div>
          {error?.field && <FieldError name={error.field} message={error.text} className="text-sm" />}
          <Button type="submit" size="lg" className="w-full">Continue</Button>
        </form>
      )}

      {step === 'pickup' && (
        <form key="pickup" className={`space-y-4 ${anim}`} noValidate onSubmit={(e) => {
          e.preventDefault()
          if (!PINCODE_SHAPE.test(pickup)) return fail({ field: 'pickup', text: 'A pincode is 6 digits and starts with 1 to 9.' })
          go('plan')
        }}>
          <h1 className="text-2xl font-semibold tracking-tight">Where do parcels leave from?</h1>
          <p className="text-sm text-muted-foreground">Your pickup pincode. It sets delivery times now and courier rates later.</p>
          <div className="space-y-1.5">
            <label htmlFor="pickup" className="block text-sm font-medium">Pincode</label>
            <input id="pickup" autoFocus inputMode="numeric" autoComplete="postal-code" maxLength={6} value={pickup}
              aria-invalid={error?.field === 'pickup' || undefined} aria-describedby={error?.field === 'pickup' ? `pickup-place ${errorId('pickup')}` : 'pickup-place'}
              onChange={(e) => { setPickup(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(null) }}
              className="h-11 w-40 rounded-md border border-input bg-card px-3 font-mono text-base aria-invalid:border-danger-text" />
            <p id="pickup-place" aria-live="polite" key={flashKey.current} className={`min-h-5 rounded px-1 -mx-1 text-sm ${place && place !== 'unknown' ? 'animate-value-flash' : ''} ${place === 'unknown' ? 'text-warn-text' : 'text-muted-foreground'}`}>
              {place === 'unknown' ? 'Not in our list yet. Continue, and add the city in Settings.' : place ? `${place.city}, ${place.state}` : ''}
            </p>
          </div>
          {error?.field && <FieldError name={error.field} message={error.text} className="text-sm" />}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="lg" onClick={() => go('name', 'back')}>Back</Button>
            <Button type="submit" size="lg" className="flex-1">Continue</Button>
          </div>
        </form>
      )}

      {step === 'plan' && (
        <form key="plan" className={`space-y-4 ${anim}`} noValidate onSubmit={(e) => { e.preventDefault(); go(codeOn ? 'phone' : 'sells') }}>
          <h1 className="text-2xl font-semibold tracking-tight">Choose your plan</h1>
          <p className="text-sm text-muted-foreground">{trialDays} days free from going live</p>
          <fieldset className="space-y-2">
            <legend className="sr-only">Plan</legend>
            {plans.map((p) => (
              <label key={p.code} className="flex cursor-pointer items-start gap-3 rounded-md border border-input bg-card p-3 text-sm has-[:checked]:border-2 has-[:checked]:border-primary">
                <input type="radio" name="plan" value={p.code} checked={plan === p.code} onChange={() => setPlan(p.code)} className="mt-1" />
                <span className="grid gap-0.5">
                  <span className="font-medium">{p.name}</span>
                  <span><span className="font-mono">{p.price}</span><span className="text-muted-foreground">/mo + GST · {p.included} orders · {p.fee} per delivered order</span></span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="lg" onClick={() => go('pickup', 'back')}>Back</Button>
            <Button type="submit" size="lg" className="flex-1">Continue</Button>
          </div>
        </form>
      )}

      {step === 'phone' && (
        <form key="phone" className={`space-y-4 ${anim}`} noValidate onSubmit={(e) => {
          e.preventDefault()
          if (verified) return go('sells')
          start(async () => {
            if (!codeId) {
              const r = await sendSignupCode(phone)
              if (!r.ok) return fail({ field: 'phone', text: r.error })
              setCodeId(r.codeId)
            } else {
              const r = await verifySignupCode(codeId, code)
              if (!r.ok) return fail({ field: 'code', text: r.error ?? 'Try again.' })
              setVerified(true); go('sells')
            }
          })
        }}>
          <h1 className="text-2xl font-semibold tracking-tight">Your WhatsApp number</h1>
          <div className="space-y-1.5">
            <label htmlFor="phone" className="block text-sm font-medium">Mobile number</label>
            <div className="flex gap-2">
              <span className="flex h-11 items-center rounded-md border border-input bg-muted px-3 font-mono text-sm">+91</span>
              <input id="phone" autoFocus inputMode="tel" autoComplete="tel-national" maxLength={10} value={phone} disabled={!!codeId}
                aria-invalid={error?.field === 'phone' || undefined} aria-describedby={error?.field === 'phone' ? errorId('phone') : undefined}
                onChange={(e) => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setError(null) }}
                className="h-11 w-44 rounded-md border border-input bg-card px-3 font-mono text-base aria-invalid:border-danger-text" />
            </div>
          </div>
          {codeId && !verified && (
            <div className="space-y-1.5">
              <label htmlFor="code" className="block text-sm font-medium">Code from WhatsApp</label>
              <input id="code" autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
                aria-invalid={error?.field === 'code' || undefined} aria-describedby={error?.field === 'code' ? errorId('code') : undefined}
                onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(null) }}
                className="h-11 w-32 rounded-md border border-input bg-card px-3 font-mono text-base tracking-widest aria-invalid:border-danger-text" />
            </div>
          )}
          {error?.field && <FieldError name={error.field} message={error.text} className="text-sm" />}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="lg" onClick={() => go('plan', 'back')} disabled={pending}>Back</Button>
            <Button type="submit" size="lg" className="flex-1" disabled={pending}>{!codeId ? 'Send code' : verified ? 'Continue' : 'Verify'}</Button>
          </div>
        </form>
      )}

      {step === 'sells' && (
        <div key="sells" className={`space-y-4 ${anim}`}>
          <h1 className="text-2xl font-semibold tracking-tight">What do you sell?</h1>
          <p className="text-sm text-muted-foreground">Pick any. It sets your starting HSN codes, size charts and product fields; you can change every value.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="What you sell">
            {SELL_LABELS.map(([k, label]) => {
              const on = sells.includes(k)
              return (
                <button key={k} type="button" aria-pressed={on}
                  onClick={() => setSells(on ? sells.filter((x) => x !== k) : [...sells, k])}
                  className="flex min-h-14 items-center gap-2.5 rounded-xl border border-input bg-card px-3 text-left text-sm font-medium transition-[border-color,box-shadow] duration-fast aria-pressed:border-foreground aria-pressed:shadow-[inset_0_0_0_1px_var(--color-foreground)]">
                  <SellIcon k={k} />{label}
                </button>
              )
            })}
          </div>
          {error?.field && <FieldError name={error.field} message={error.text} className="text-sm" />}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="lg" onClick={() => go(codeOn ? 'phone' : 'plan', 'back')} disabled={pending}>Back</Button>
            <Button type="button" size="lg" className="flex-1" onClick={submit} disabled={pending}>
              {pending ? 'Creating your shop…' : sells.length ? 'Create my shop' : 'Skip and create my shop'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/** A line drawing per category (decorative; the words say what it is). */
function SellIcon({ k }: { k: SellKey }) {
  const d: Record<SellKey, string> = {
    women: 'M9 3h6l1 5-2 1 2 12H8l2-12-2-1z', men: 'M8 3l4 2 4-2 4 4-3 3v11H7V10L4 7z', kids: 'M12 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 9h8l-1 6h-6zM9 15l-1 6M15 15l1 6',
    ethnic: 'M12 3l3 4-1 3 3 11H7l3-11-1-3z', footwear: 'M3 16c4 0 6-2 8-6l3 3c2 2 4 3 7 3v3H3z', accessories: 'M5 9h14l-1.5 11h-11zM9 9a3 3 0 0 1 6 0',
    jewellery: 'M6 4h12l3 5-9 11L3 9zM3 9h18', beauty: 'M9 3h6v4l2 3v10H7V10l2-3z', wellness: 'M12 21c-5-3-8-7-8-11a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 4-3 8-8 11z',
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6 shrink-0 fill-none stroke-current stroke-[1.5] text-muted-foreground"><path d={d[k]} strokeLinecap="round" strokeLinejoin="round" /></svg>
}
