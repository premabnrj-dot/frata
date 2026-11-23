'use client'

import { useRouter } from 'next/navigation'
import { useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FIELD } from '@/components/ui/field'
import { FieldError } from '@/components/ui/field-error'
import { InfoTip } from '@/components/ui/info-tip'
import { useToast } from '@/components/ui/toast'
import { settle } from '@/lib/settle'
import { STATE_CODE, STATES } from '@/domains/checkout/states'
import { setDetailsAction } from './actions'
import { freshly } from './fresh'
import type { DetailsIn } from './credits-parts'

// =============================================================================
// FILE: credits/credits-dialogs.tsx — the dialogs Credits and billing loads when first opened (credits-parts.tsx imports
// them with next/dynamic): a number of credits (a client's budget, new websites' start) and "Invoices go to". Mockups
// docs/mockups/2026-11-22-four-screens.html § 1 and docs/mockups/2026-11-22-c1-undrawn.html, approved 2026-11-22.
// =============================================================================

export function NumberDialog({ open, onClose, title, label, start, save, saveLabel, undo = false, used }: { open: boolean; onClose: () => void; title: string; label: string; start: number | null
  save: (n: number) => Promise<{ ok: true; text: string } | { ok: false; error: string; fields?: Record<string, string> }>; saveLabel: string
  /** Offer Undo on the saved toast: saves `start` back (as drawn for a client's budget; none when nothing stood before). */
  undo?: boolean
  /** A client's budget: what it has used, shown and checked first (as drawn). */
  used?: { client: string; n: number } }) {
  const router = useRouter(), toast = useToast()
  const [v, setV] = useState(start === null ? '' : String(start))
  const [field, setField] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  const go = async () => {
    const n = Number(v.replace(/\D/g, ''))
    if (!n) { setField('Enter a number of credits.'); ref.current?.focus(); return }
    if (used && n < used.n) { setField(`${used.client} has used ${used.n}. Set ${used.n} or more.`); ref.current?.focus(); return }
    setBusy(true); const r = await freshly(() => save(n)); setBusy(false)
    if (!r.ok) { const f = (r as { fields?: Record<string, string> }).fields?.credits; if (f) { setField(f); ref.current?.focus() } else setError(r.error); return }
    const before = start
    onClose(); settle(router)
    toast.ok(r.text, undo && before !== null && before !== n ? { undo: async () => {
      const u = await freshly(() => save(before)); settle(router)
      return u.ok ? { ok: true } : { ok: false, error: u.error }
    } } : undefined)
  }
  return <Dialog open={open} onClose={onClose} title={title} error={error}
    actions={<><Button variant="secondary" onClick={onClose} data-autofocus>Cancel</Button><Button busy={busy} onClick={go}>{saveLabel}</Button></>}>
    {used && <dl className="mb-3 grid grid-cols-[1fr_auto] gap-x-3 text-sm"><dt className="text-muted-foreground">Used</dt><dd className="font-num text-right">{used.n}</dd></dl>}
    <label className="grid gap-1"><span className="text-label">{label}</span>
      <input ref={ref} className={`${FIELD} font-num`} inputMode="numeric" value={v} aria-invalid={!!field} onChange={(e) => { setV(e.target.value); setField(null) }} />
      <FieldError message={field} /></label>
  </Dialog>
}

/** "Invoices go to" (as drawn): a GSTIN decides the state, shown and fixed; without one the state is picked. */
export function DetailsDialog({ open, d, onClose, onSaved }: { open: boolean; d: DetailsIn; onClose: () => void; onSaved?: () => void }) {
  const router = useRouter(), toast = useToast()
  const [v, setV] = useState({ legalName: d.legalName ?? '', gstin: d.gstin ?? '', state: d.stateName ?? '', address: d.address ?? '' })
  const [fields, setFields] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const form = useRef<HTMLDivElement>(null)
  const uid = useId()
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setV({ ...v, [k]: e.target.value }); setFields({ ...fields, [k]: '' }) }
  const close = () => { setError(null); setFields({}); onClose() }
  // The state a GSTIN's first two digits name, from the state table already here (not tax/gstin.ts: its validation words
  // cost this page 1 kB of first-load script against a 150 kB budget).
  const code = /^[0-9]{2}/.test(v.gstin.trim()) ? v.gstin.trim().slice(0, 2) : null
  const fromGstin = code ? STATES.find((x) => STATE_CODE[x] === code) ?? null : null
  const go = async () => {
    setBusy(true); const r = await freshly(() => setDetailsAction({ ...v, email: '' })); setBusy(false)
    if (!r.ok) {
      const f = (r as { fields?: Record<string, string> }).fields
      if (!f) { setError(r.error); return }
      setFields(f)
      requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    close(); toast.ok(r.text); settle(router); onSaved?.()
  }
  return <Dialog open={open} onClose={close} title="Invoices go to" error={error}
    actions={<><Button variant="secondary" onClick={close} data-autofocus>Cancel</Button><Button busy={busy} onClick={go}>Save details</Button></>}>
    <div ref={form} className="grid gap-3">
      <label className="grid gap-1"><span className="text-label">Legal name</span><input className={FIELD} value={v.legalName} onChange={set('legalName')} aria-invalid={!!fields.legalName} maxLength={120} /><FieldError message={fields.legalName} /></label>
      {/* The (i) sits beside the label, never inside it: a label names its FIRST control, and that would be the tip's button. */}
      <div className="grid gap-1"><span className="flex items-center gap-1 text-label"><label htmlFor={`${uid}-gstin`}>GSTIN (optional)</label><InfoTip about="GSTIN">Your 15-character GST number</InfoTip></span>
        <input id={`${uid}-gstin`} className={`${FIELD} font-mono uppercase`} value={v.gstin} onChange={set('gstin')} aria-invalid={!!fields.gstin} maxLength={15} /><FieldError message={fields.gstin} /></div>
      <label className="grid gap-1"><span className="text-label">State</span>
        <select className={FIELD} value={fromGstin ?? v.state} onChange={set('state')} disabled={!!fromGstin} aria-invalid={!!fields.state}><option value="">Pick the state</option>{STATES.map((x) => <option key={x}>{x}</option>)}</select>
        <FieldError message={fields.state} /></label>
      <label className="grid gap-1"><span className="text-label">Address</span><input className={FIELD} value={v.address} onChange={set('address')} aria-invalid={!!fields.address} maxLength={300} /><FieldError message={fields.address} /></label>
      <p className="text-sm text-muted-foreground">Invoices already issued don’t change.</p>
    </div>
  </Dialog>
}
