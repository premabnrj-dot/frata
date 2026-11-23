'use client'

import { useEffect, useState } from 'react'
import { FieldError, errorId } from '@/components/ui/field-error'
import { PINCODE_SHAPE } from '@/domains/signup/slug'
import type { Field, Values } from '@/domains/settings/sections'
import { placeFor } from '../actions'

/** One PIN code (Store details › Pickup PIN code, O1·5): six digits, and beside them the city and state from India
 *  Post's directory — the saved one's read with the page, a new one's asked once six digits are typed. */
export function PincodeField({ f, value, error, onChange, saved, savedPlace }: { f: Field; value: Values[string] | undefined; error?: string
  onChange: (v: string) => void; saved: string; savedPlace: { city: string; state: string } | null }) {
  const id = `f-${f.key}`
  const v = typeof value === 'string' ? value : ''
  const [looked, setLooked] = useState<{ pin: string; place: { city: string; state: string } | null } | null>(null)
  // Opened from Delivery Zones' header (O1·6): the field takes focus.
  useEffect(() => {
    if (window.location.hash !== `#${id}`) return
    const el = document.getElementById(id)
    el?.scrollIntoView({ block: 'center' }); el?.focus({ preventScroll: true })
  }, [id])
  useEffect(() => {
    if (!PINCODE_SHAPE.test(v) || v === saved) return
    let live = true
    placeFor(v).then((p) => { if (live) setLooked({ pin: v, place: p }) }).catch(() => undefined)
    return () => { live = false }
  }, [v, saved])
  const place = !PINCODE_SHAPE.test(v) ? undefined : v === saved ? (savedPlace ?? null) : looked?.pin === v ? looked.place : undefined
  const line = place === undefined ? '' : place ? `${place.city}, ${place.state}` : 'We do not know this PIN code. Check the 6 digits.'
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[11rem_minmax(0,1fr)] items-end gap-3">
        <div className="space-y-1">
          <label htmlFor={id} className="block text-sm font-medium">{f.label}<span className="font-normal text-muted-foreground"> (optional)</span></label>
          <input id={id} value={v} inputMode="numeric" maxLength={6} autoComplete="postal-code" aria-invalid={!!error || undefined}
            aria-describedby={error ? errorId(id) : `${id}-place`} onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="h-11 w-full rounded-md border border-input bg-card px-3 font-mono text-sm aria-invalid:border-danger-text md:h-9" />
        </div>
        <div className="min-w-0 space-y-1">
          <span id={`${id}-place-l`} className="block text-sm font-medium">City and state</span>
          <p id={`${id}-place`} aria-live="polite" key={line}
            className={`flex min-h-11 items-center rounded px-1 -mx-1 text-sm md:min-h-9 ${line ? 'animate-value-flash' : ''} ${place === null ? 'text-warn-text' : 'text-muted-foreground'}`}>{line}</p>
        </div>
      </div>
      {error ? <FieldError name={id} message={error} /> : null}
    </div>
  )
}
