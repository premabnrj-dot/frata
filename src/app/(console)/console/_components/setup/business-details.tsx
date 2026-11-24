'use client'

import { useEffect, useState } from 'react'
import { Facts } from '@/components/data/facts'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FIELD } from '@/components/ui/field'
import { FieldError, fieldProps } from '@/components/ui/field-error'
import { InfoTip } from '@/components/ui/info-tip'
import { STATE_CODE, STATES } from '@/domains/checkout/states'
import type { Unrated } from '@/domains/tax/rates'
import { cn } from '@/lib/utils'
import dynamic from 'next/dynamic'
import { loadSetupPopup, saveSetupFields } from '../../settings/setup-actions'
import type { FieldsDraft, PopupProps } from './drafts'

// "Business details" (mockup § 2 `#ov-biz`, O2a·7) in two short views: the legal name and GST registration (the state
// only when not registered: a GSTIN says its own, § Deviations 3), then the grievance officer, its email filled from
// customer care. "Save details" saves both in one call, only these seven fields (the setup popups' subset save). Once
// the store has an owner the page is the owner's (PP1): a partner sees the values as facts and Ask the owner.

// Loaded only in the two rarer states (a page now the owner's; products a GSTIN leaves unbuyable): shared with the
// Settings pages, they would otherwise split those pages' script and grow it.
const AskOwner = dynamic(() => import('./owner-views').then((m) => m.AskOwner))
const UnratedNotice = dynamic(() => import('./owner-views').then((m) => m.UnratedNotice))

const LABEL = 'text-label font-medium'
const REG = [['none', 'Not registered'], ['regular', 'Regular'], ['composition', 'Composition']] as const
const BUSINESS = ['legalName', 'gstRegistration', 'homeState', 'gstin']

export function BusinessDetails({ open, draft, setDraft, onClose, onSaved }: PopupProps<FieldsDraft>) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [unrated, setUnrated] = useState<Unrated | null>(null)
  // Back enters view 1 from the left; never on the popup's first paint.
  const [back, setBack] = useState(false)
  useEffect(() => {
    if (!open || draft) return
    loadSetupPopup('details').then((r) => (r.ok ? setDraft({ values: r.values, version: r.version, locked: r.locked, held: r.held, view: 1 }) : setError(r.error)), () => setError('We couldn’t reach Frrata. Try again.'))
  }, [open, draft, setDraft])
  // A refused save (Feedback rule 3): focus goes to the first wrong field, once its view has rendered.
  useEffect(() => {
    if (!Object.keys(errors).length) return
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>('dialog[open] [aria-invalid="true"]')?.focus())
  }, [errors])
  const v = draft?.values ?? {}
  const s = (k: string) => String(v[k] ?? '')
  const set = (k: string, x: string) => draft && setDraft({ ...draft, values: { ...draft.values, [k]: x } })
  const view = draft?.view ?? 1
  const go = (n: 1 | 2) => { if (!draft) return; setBack(n === 1); setDraft({ ...draft, view: n }) }
  const reg = s('gstRegistration') || 'none'
  const regName = REG.find(([k]) => k === reg)?.[1] ?? ''

  const save = async () => {
    if (!draft) return
    setBusy(true); setError(null); setErrors({})
    try {
      const values = { legalName: s('legalName'), gstRegistration: reg, ...(reg === 'none' ? { homeState: s('homeState') } : { gstin: s('gstin') }),
        grievanceName: s('grievanceName'), grievancePhone: s('grievancePhone'), grievanceEmail: s('grievanceEmail') }
      const r = await saveSetupFields('details', values, draft.version)
      if (r.ok) { if (r.unrated) setUnrated(r.unrated); else onSaved('Saved business details.'); return }
      const fieldErrors = 'errors' in r ? r.errors : undefined
      if (fieldErrors) { setErrors(fieldErrors); if (Object.keys(fieldErrors).some((k) => BUSINESS.includes(k))) go(1) } else setError(r.error)
    } catch {
      setError('We couldn’t save. Nothing was changed. Try again in a minute.')
    } finally { setBusy(false) }
  }

  if (draft?.locked) {
    return (
      <Dialog open={open} className="w-[min(27.5rem,calc(100vw-2rem))]" onClose={onClose} onDismiss={onClose} title="Business details" actions={<AskOwner page="business" asked={false} />}>
        <Facts rows={[['Legal name', s('legalName') || '—'], ['GST registration', regName], ...(reg === 'none' ? [] : [['GSTIN', <span key="g" className="font-mono">{s('gstin')}</span>] as [string, React.ReactNode]])]} />
      </Dialog>
    )
  }
  if (unrated) {
    return (
      <Dialog open={open} className="w-[min(27.5rem,calc(100vw-2rem))]" onClose={() => onSaved('Saved business details.')} title="Business details" actions={<Button data-autofocus onClick={() => onSaved('Saved business details.')}>Back to setup</Button>}>
        <UnratedNotice u={unrated} />
      </Dialog>
    )
  }
  const field = (k: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="grid min-w-0 gap-1.5"><span className={LABEL}>{label}</span>
      <input className={`${FIELD} w-full`} value={s(k)} disabled={!draft} onChange={(e) => set(k, e.target.value)} {...fieldProps(`bd-${k}`, errors[k])} {...props} />
      <FieldError name={`bd-${k}`} message={errors[k]} /></label>
  )
  return (
    <Dialog open={open} className="w-[min(27.5rem,calc(100vw-2rem))]" onClose={onClose} onDismiss={onClose} error={error} title={view === 1 ? 'Business details' : 'Grievance officer'}
      titleAfter={view === 2 ? <InfoTip about="the grievance officer">The law asks your store to name a person who answers complaints.</InfoTip> : null}
      actions={view === 1
        ? <><Button variant="secondary" onClick={onClose}>Not now</Button><Button disabled={!draft} onClick={() => go(2)}>Add grievance officer</Button></>
        : <><Button variant="secondary" onClick={() => go(1)}>Back</Button><Button busy={busy} onClick={() => void save()}>Save details</Button></>}>
      {view === 1 ? (
        <div key="v1" className={cn('grid gap-3', back && 'animate-step-back')}>
          {field('legalName', 'Legal name', { 'data-autofocus': true, autoFocus: back } as React.InputHTMLAttributes<HTMLInputElement>)}
          <div className="grid grid-cols-2 gap-2.5">
            <label className="grid min-w-0 gap-1.5"><span className={LABEL}>GST registration</span>
              <select className={`${FIELD} w-full`} value={reg} disabled={!draft} onChange={(e) => set('gstRegistration', e.target.value)}>
                {REG.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
              </select></label>
            {reg === 'none' && (
              <label className="grid min-w-0 gap-1.5"><span className={LABEL}>State</span>
                <select className={`${FIELD} w-full`} value={s('homeState')} disabled={!draft} onChange={(e) => set('homeState', e.target.value)} {...fieldProps('bd-homeState', errors.homeState)}>
                  <option value="" disabled />
                  {STATES.map((n) => <option key={n} value={STATE_CODE[n]}>{n}</option>)}
                </select>
                <FieldError name="bd-homeState" message={errors.homeState} /></label>
            )}
          </div>
          {reg !== 'none' && field('gstin', 'GSTIN', { placeholder: '08ABCDE1234F1Z5', maxLength: 15, className: `${FIELD} w-full font-mono uppercase` })}
        </div>
      ) : (
        <div key="v2" className="grid animate-step-forward gap-3">
          <div className="grid grid-cols-2 gap-2.5">
            {field('grievanceName', 'Name', { autoComplete: 'name', 'data-autofocus': true, autoFocus: true } as React.InputHTMLAttributes<HTMLInputElement>)}
            {field('grievancePhone', 'Phone', { inputMode: 'tel', autoComplete: 'tel-national', className: `${FIELD} w-full font-num` })}
          </div>
          {field('grievanceEmail', 'Email', { type: 'email', autoComplete: 'email' })}
        </div>
      )}
    </Dialog>
  )
}
