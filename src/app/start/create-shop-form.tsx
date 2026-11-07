'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { PINCODE_SHAPE, slugFor, slugProblem } from '@/domains/signup/slug'
import { checkAddress, createMyShop, lookupPincode, type AddressCheck } from './actions'

const SELL_LABELS = [['women', 'Women'], ['men', 'Men'], ['kids', 'Kids'], ['ethnic', 'Ethnic wear'], ['accessories', 'Accessories'], ['footwear', 'Footwear']] as const
type Step = 'name' | 'pickup' | 'sells'

const ADDRESS_WORDS: Record<AddressCheck['state'], string> = {
  ok: 'Available', taken: 'Taken. Try another.', too_short: 'At least 3 letters', shape: 'Letters, digits and hyphens only', reserved: 'Reserved. Try another.',
}

/** Shop name (address derived live) → pickup pincode → optional "what do you sell" → the console. */
export function CreateShopForm({ shopDomain }: { shopDomain: string }) {
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
  const [error, setError] = useState<{ field?: string; text: string } | null>(null)
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
      const r = await createMyShop({ name, slug, pickup, sells })
      if (r.ok || r.hasShop) { router.replace('/console'); router.refresh(); return }
      setError({ field: r.field, text: r.error })
      if (r.field === 'slug' || r.field === 'name') go('name', 'back')
      if (r.field === 'pickup') go('pickup', 'back')
    })
  }

  const anim = dir === 'forward' ? 'animate-step-forward' : 'animate-step-back'
  const stepNo = { name: 1, pickup: 2, sells: 3 }[step]

  return (
    <div className="space-y-5">
      <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className="h-full w-full origin-left bg-brand transition-transform duration-slow ease-standard" style={{ transform: `scaleX(${stepNo / 3})` }} />
      </div>
      <p className="text-xs text-muted-foreground">Step <span className="font-mono">{stepNo}</span> of <span className="font-mono">3</span></p>

      {step === 'name' && (
        <form key="name" className={`space-y-4 ${anim}`} noValidate onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return setError({ field: 'name', text: 'Your shop needs a name. You can change it later.' })
          if (address?.state !== 'ok') return setError({ field: 'slug', text: address ? ADDRESS_WORDS[address.state] : 'Choose an address.' })
          go('pickup')
        }}>
          <h1 className="text-2xl font-semibold tracking-tight">What is your shop called?</h1>
          <div className="space-y-1.5">
            <label htmlFor="name" className="block text-sm font-medium">Shop name</label>
            <input id="name" autoFocus autoComplete="organization" maxLength={60} value={name} placeholder="Kesar Studio"
              aria-invalid={error?.field === 'name' || undefined}
              onChange={(e) => { setName(e.target.value); setError(null); if (!slugEdited) setSlug(slugFor(e.target.value)) }}
              className="h-11 w-full rounded-md border border-input bg-card px-3 text-base aria-invalid:border-danger-text" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="slug" className="block text-sm font-medium">Shop address</label>
            <div className="flex items-center gap-1 rounded-md bg-muted px-3 py-2.5 font-mono text-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
              <input id="slug" value={slug} aria-describedby="slug-state" aria-invalid={error?.field === 'slug' || undefined}
                onChange={(e) => { setSlugEdited(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30)); setError(null) }}
                className="min-w-0 flex-1 bg-transparent outline-none" style={{ maxWidth: `${Math.max(4, slug.length + 1)}ch` }} />
              <span className="text-muted-foreground">.{shopDomain}</span>
            </div>
            <p id="slug-state" aria-live="polite" className={`min-h-5 text-sm ${address?.state === 'ok' ? 'text-ok-text' : address ? 'text-warn-text' : 'text-muted-foreground'}`}>
              {address ? ADDRESS_WORDS[address.state] : 'Made from the name. You can edit it.'}
            </p>
          </div>
          {error && <p role="alert" className="text-sm text-danger-text">{error.text}</p>}
          <Button type="submit" size="lg" className="w-full">Continue</Button>
        </form>
      )}

      {step === 'pickup' && (
        <form key="pickup" className={`space-y-4 ${anim}`} noValidate onSubmit={(e) => {
          e.preventDefault()
          if (!PINCODE_SHAPE.test(pickup)) return setError({ field: 'pickup', text: 'A pincode is 6 digits and starts with 1 to 9.' })
          go('sells')
        }}>
          <h1 className="text-2xl font-semibold tracking-tight">Where do parcels leave from?</h1>
          <p className="text-sm text-muted-foreground">Your pickup pincode. It sets delivery times now and courier rates later.</p>
          <div className="space-y-1.5">
            <label htmlFor="pickup" className="block text-sm font-medium">Pincode</label>
            <input id="pickup" autoFocus inputMode="numeric" autoComplete="postal-code" maxLength={6} value={pickup}
              aria-invalid={error?.field === 'pickup' || undefined} aria-describedby="pickup-place"
              onChange={(e) => { setPickup(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(null) }}
              className="h-11 w-40 rounded-md border border-input bg-card px-3 font-mono text-base aria-invalid:border-danger-text" />
            <p id="pickup-place" aria-live="polite" key={flashKey.current} className={`min-h-5 rounded px-1 -mx-1 text-sm ${place && place !== 'unknown' ? 'animate-value-flash' : ''} ${place === 'unknown' ? 'text-warn-text' : 'text-muted-foreground'}`}>
              {place === 'unknown' ? 'Not in our list yet. Continue, and add the city in Settings.' : place ? `${place.city}, ${place.state}` : ''}
            </p>
          </div>
          {error && <p role="alert" className="text-sm text-danger-text">{error.text}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="lg" onClick={() => go('name', 'back')}>Back</Button>
            <Button type="submit" size="lg" className="flex-1">Continue</Button>
          </div>
        </form>
      )}

      {step === 'sells' && (
        <div key="sells" className={`space-y-4 ${anim}`}>
          <h1 className="text-2xl font-semibold tracking-tight">What do you sell?</h1>
          <p className="text-sm text-muted-foreground">Pick any. We start your size charts from it; you can change every value.</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="What you sell">
            {SELL_LABELS.map(([k, label]) => {
              const on = sells.includes(k)
              return (
                <button key={k} type="button" aria-pressed={on}
                  onClick={() => setSells(on ? sells.filter((x) => x !== k) : [...sells, k])}
                  className="h-10 rounded-full border border-input px-4 text-sm transition-colors duration-fast aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground">
                  {label}
                </button>
              )
            })}
          </div>
          {error && <p role="alert" className="text-sm text-danger-text">{error.text}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="lg" onClick={() => go('pickup', 'back')} disabled={pending}>Back</Button>
            <Button type="button" size="lg" className="flex-1" onClick={submit} disabled={pending}>
              {pending ? 'Creating your shop…' : sells.length ? 'Create my shop' : 'Skip and create my shop'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
