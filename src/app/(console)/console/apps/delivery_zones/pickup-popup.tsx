'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FIELD } from '@/components/ui/field'
import { FieldError, fieldProps } from '@/components/ui/field-error'
import { useToast } from '@/components/ui/toast-context'
import { PINCODE_SHAPE } from '@/domains/signup/slug'
import { placeFor } from '../../settings/actions'
import { loadSetupPopup, saveSetupFields } from '../../settings/setup-actions'

// "Pickup PIN code" (mockup § 2 `#ov-pickup`, O2a·9): the PIN code and, once it has six digits, its city and state from
// India Post's directory (flashed when it changes); saved through the setup popups' subset save, only pickupPincode.

export function PickupPopup({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const [pin, setPin] = useState('')
  const [version, setVersion] = useState<number | null>(null)
  const [place, setPlace] = useState<{ pin: string; line: string; known: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<string | undefined>()
  // Once the person types, the stored value arriving late never overwrites it (it still brings the version).
  const typed = useRef(false)
  useEffect(() => {
    if (!open || version !== null) return
    loadSetupPopup('pickup').then((r) => { if (r.ok) { setVersion(r.version); if (!typed.current) setPin(String(r.values.pickupPincode ?? '')) } else setError(r.error) },
      () => setError('We couldn’t reach Frrata. Try again.'))
  }, [open, version])
  useEffect(() => {
    if (!PINCODE_SHAPE.test(pin)) return
    let live = true
    placeFor(pin).then((p) => { if (live) setPlace({ pin, known: !!p, line: p ? `${p.city}, ${p.state}` : 'We do not know this PIN code. Check the 6 digits.' }) }).catch(() => undefined)
    return () => { live = false }
  }, [pin])
  const line = place?.pin === pin ? place : null
  const save = async () => {
    if (version === null) return
    setBusy(true); setError(null); setFieldError(undefined)
    try {
      const r = await saveSetupFields('pickup', { pickupPincode: pin }, version)
      if (r.ok) { setVersion(null); typed.current = false; onClose(); toast.ok('Saved your pickup PIN code.'); return }
      if ('errors' in r && r.errors?.pickupPincode) setFieldError(r.errors.pickupPincode); else setError(r.error)
    } catch {
      setError('We couldn’t save. Nothing was changed. Try again in a minute.')
    } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} className="w-[min(27.5rem,calc(100vw-2rem))]" onClose={onClose} onDismiss={onClose} title="Pickup PIN code" error={error}
      actions={<><Button variant="secondary" onClick={onClose}>Not now</Button><Button busy={busy} disabled={version === null} onClick={() => void save()}>Save PIN code</Button></>}>
      <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-2.5">
        <label className="grid min-w-0 gap-1.5"><span className="text-label font-medium">PIN code</span>
          <input data-autofocus className={`${FIELD} w-full font-num`} inputMode="numeric" maxLength={6} autoComplete="postal-code" value={pin}
            onChange={(e) => { typed.current = true; setPin(e.target.value.replace(/\D/g, '').slice(0, 6)) }} {...fieldProps('pk-pin', fieldError)} /></label>
        <div className="grid min-w-0 gap-1.5"><span className="text-label font-medium">City and state</span>
          {/* The live region stays mounted (a new one is often not spoken); only the line inside is re-keyed, to flash. */}
          <p aria-live="polite" className={`flex min-h-11 items-center text-label md:min-h-9 ${line && !line.known ? 'text-warn-text' : 'text-muted-foreground'}`}>
            <span key={line?.line ?? ''} className={`rounded-md px-1 ${line ? 'animate-value-flash' : ''}`}>{line?.line ?? ''}</span></p></div>
      </div>
      <FieldError name="pk-pin" message={fieldError} />
    </Dialog>
  )
}
