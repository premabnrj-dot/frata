'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { InfoTip } from '@/components/ui/info-tip'
import { FieldError, errorId, useErrorSummary } from '@/components/ui/field-error'
import { useToast } from '@/components/ui/toast'
import { PINCODE_SHAPE, slugFor, slugProblem } from '@/domains/signup/slug'
import { checkAddress, lookupPincode, type AddressCheck } from '@/app/start/actions'
import { createClientStoreAction } from './actions'

const ADDRESS_WORDS: Record<AddressCheck['state'], string> = {
  ok: 'Free', taken: 'Taken. Try another.', too_short: 'At least 3 letters', shape: 'Letters, digits and hyphens only', reserved: 'Reserved. Try another.',
}

/** One screen, three fields (the same as /start): name, its address (derived, editable), pickup pincode. */
export function NewStoreForm({ shopDomain }: { shopDomain: string }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [edited, setEdited] = useState(false)
  const [address, setAddress] = useState<AddressCheck | null>(null)
  const [pickup, setPickup] = useState('')
  const [place, setPlace] = useState<{ city: string; state: string } | null | 'unknown'>(null)
  // A field's mistake stays at it with one quiet summary; a refusal naming no field is a toast (§ Feedback).
  const [error, setError] = useState<{ field?: string; text: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const toast = useToast()
  const formRef = useRef<HTMLFormElement>(null)
  useErrorSummary(error?.field ? { [error.field]: error.text } : {}, { attempt, scope: formRef })
  const fail = (e: { field?: string; text: string }) => { if (e.field) { setError(e); setAttempt((a) => a + 1) } else { setError(null); toast.error(e.text) } }
  const [pending, start] = useTransition()

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
    lookupPincode(pickup).then((p) => { if (live) setPlace(p ?? 'unknown') })
    return () => { live = false }
  }, [pickup])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return fail({ field: 'name', text: 'The shop needs a name.' })
    if (address?.state !== 'ok') return fail({ field: 'slug', text: address ? ADDRESS_WORDS[address.state] : 'Choose an address.' })
    if (!PINCODE_SHAPE.test(pickup)) return fail({ field: 'pickup', text: 'A pincode is 6 digits.' })
    setError(null)
    start(async () => {
      const r = await createClientStoreAction({ name, slug, pickup })
      if (!r.ok) return fail({ field: r.field, text: r.error })
      router.replace('/console'); router.refresh()
    })
  }
  const field = 'h-10 w-full rounded-md border border-input bg-card px-3 text-sm aria-invalid:border-danger-text md:h-9'
  const msg = (f: string) => <FieldError name={f} message={error?.field === f ? error.text : null} className="text-sm" />
  return (
    <form ref={formRef} onSubmit={submit} noValidate className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="name" className="block text-sm font-medium">Brand’s shop name</label>
        <input id="name" value={name} maxLength={60} autoFocus aria-invalid={error?.field === 'name' || undefined} aria-describedby={error?.field === 'name' ? errorId('name') : undefined}
          onChange={(e) => { setName(e.target.value); if (!edited) setSlug(slugFor(e.target.value)); setError(null) }} className={field} />
        {msg('name')}
      </div>
      <div className="space-y-1.5">
        <label htmlFor="slug" className="block text-sm font-medium">Shop address</label>
        <div className="flex items-stretch overflow-hidden rounded-md border border-input bg-card">
          <input id="slug" value={slug} aria-invalid={error?.field === 'slug' || undefined} aria-describedby={error?.field === 'slug' ? `slug-state ${errorId('slug')}` : 'slug-state'}
            onChange={(e) => { setEdited(true); setSlug(e.target.value.toLowerCase()); setError(null) }} className="h-10 min-w-0 flex-1 bg-transparent px-3 font-mono text-sm outline-none md:h-9" />
          <span className="flex items-center bg-muted px-3 font-mono text-sm text-muted-foreground">.{shopDomain}</span>
        </div>
        <p id="slug-state" className={`text-sm ${address?.state === 'ok' ? 'text-ok-text' : 'text-muted-foreground'}`}>{address ? ADDRESS_WORDS[address.state] : ' '}</p>
        {msg('slug')}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center"><label htmlFor="pickup" className="text-sm font-medium">Pickup pincode</label><InfoTip about="pickup pincode">Where the brand’s parcels are collected. Delivery days are counted from here.</InfoTip></div>
        <input id="pickup" value={pickup} inputMode="numeric" maxLength={6} aria-invalid={error?.field === 'pickup' || undefined} aria-describedby={error?.field === 'pickup' ? errorId('pickup') : undefined}
          onChange={(e) => { setPickup(e.target.value.replace(/\D/g, '')); setError(null) }} className={`${field} w-40 font-mono`} />
        {place && <p className="text-sm text-muted-foreground">{place === 'unknown' ? 'Pincode not found' : `${place.city}, ${place.state}`}</p>}
        {msg('pickup')}
      </div>
      <Button type="submit" disabled={pending}>{pending ? 'Creating…' : name.trim() ? `Create ${name.trim()}` : 'Create store'}</Button>
    </form>
  )
}
