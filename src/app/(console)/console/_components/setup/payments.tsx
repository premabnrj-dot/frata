'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button, button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FIELD } from '@/components/ui/field'
import { FieldError, fieldProps } from '@/components/ui/field-error'
import { Switch } from '@/components/ui/switch'
import { loadSetupPopup, saveSetupFields } from '../../settings/setup-actions'
import type { FieldsDraft, PopupProps } from './drafts'

// "How shoppers pay" (mockup § 2 `#ov-pay`, O2a·7): Pay on delivery and its limit, saved through the setup popups'
// field-subset save (only codOn and codMax); UPI and cards is Razorpay's own page, where keys are tested before saving.
// While Delivery Zones is usable the limit is its own (held): shown as text with a link there.

export function Payments({ open, draft, setDraft, onClose, onSaved, connected }: PopupProps<FieldsDraft> & { connected?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!open || draft) return
    loadSetupPopup('payments').then((r) => (r.ok ? setDraft({ values: r.values, version: r.version, locked: r.locked, held: r.held, view: 1 }) : setError(r.error)), () => setError('We couldn’t reach Frrata. Try again.'))
  }, [open, draft, setDraft])
  const v = draft?.values ?? {}
  const set = (k: string, x: string | boolean) => draft && setDraft({ ...draft, values: { ...draft.values, [k]: x } })
  const save = async () => {
    if (!draft) return
    setBusy(true); setError(null); setStale(false); setErrors({})
    try {
      const r = await saveSetupFields('payments', draft.held ? { codOn: v.codOn === true } : { codOn: v.codOn === true, codMax: String(v.codMax ?? '') }, draft.version)
      if (r.ok) { onSaved('Saved payment choices.'); return }
      if ('stale' in r) { setStale(true); return }
      if (r.errors) setErrors(r.errors); else setError(r.error)
    } catch {
      setError('We couldn’t save. Nothing was changed. Try again in a minute.')
    } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} className="w-[min(27.5rem,calc(100vw-2rem))]" onClose={onClose} onDismiss={onClose} title="How shoppers pay"
      error={stale ? <>Change the lowest order in Pay on delivery first. <Link href="/console/settings/payments" className="font-semibold underline">Pay on delivery</Link></> : error}
      actions={<><Button variant="secondary" onClick={onClose}>Not now</Button><Button busy={busy} disabled={!draft} onClick={() => void save()}>Save payment choices</Button></>}>
      <div className="grid gap-3">
        <div className="flex min-h-10 items-center justify-between gap-3">
          <span className="font-medium" id="pay-cod">Pay on delivery</span>
          <Switch on={v.codOn === true} onChange={(x) => set('codOn', x)} label="Pay on delivery" disabled={!draft} />
        </div>
        {draft?.held ? (
          <p className="grid gap-1 text-sm"><span className="text-label font-medium">Pay on delivery up to</span>
            <span><span className="font-num">₹{String(v.codMax ?? '')}</span> · <Link href="/console/apps/delivery_zones" className="text-link underline-offset-2 hover:underline">Set in Delivery Zones</Link></span></p>
        ) : (
          <label className="grid gap-1.5"><span className="text-label font-medium">Pay on delivery up to</span>
            <span className="relative block max-w-40"><span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-muted-foreground">₹</span>
              <input data-autofocus className={`${FIELD} w-full pl-6 font-num`} inputMode="numeric" value={String(v.codMax ?? '')} disabled={!draft}
                onChange={(e) => set('codMax', e.target.value)} {...fieldProps('pay-max', errors.codMax)} /></span>
            <FieldError name="pay-max" message={errors.codMax} /></label>
        )}
        <div className="flex min-h-10 items-center justify-between gap-3 border-t border-line-soft pt-3">
          <span className="font-medium">UPI and cards</span>
          {connected ? <Badge tone="ok">Connected</Badge> : <Link href="/console/settings/online-payments" className={button({ variant: 'secondary', size: 'sm' })}>Connect Razorpay</Link>}
        </div>
      </div>
    </Dialog>
  )
}
