'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { STATES } from '@/domains/checkout/states'
import { addOrderNote, editOrderContact } from '../actions'

// =============================================================================
// FILE: src/app/(console)/console/orders/_components/contact-and-notes.tsx
//
// The order page's two small forms (1D·4c): editing who it goes to (owners
// and admins, until packed — the slip carries the address; the history says
// which fields changed, never the old or new values) and the team's notes
// (never shown to the shopper). Errors are said where they happened.
// =============================================================================

export type Contact = { customerName: string; phone: string; addressLine: string; area: string; landmark: string; pincode: string; city: string; state: string }
const FIELDS: { key: keyof Contact; label: string; type?: string; inputMode?: 'numeric' | 'tel' }[] = [
  { key: 'customerName', label: 'Full name' }, { key: 'phone', label: 'Mobile number', type: 'tel', inputMode: 'tel' },
  { key: 'addressLine', label: 'House, street' }, { key: 'area', label: 'Area, locality' }, { key: 'landmark', label: 'Landmark' },
  { key: 'pincode', label: 'Pincode', inputMode: 'numeric' }, { key: 'city', label: 'City' },
]

export function EditContact({ orderId, number, contact }: { orderId: string; number: string; contact: Contact }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [f, setF] = useState(contact)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function save() {
    const changed = Object.fromEntries(Object.entries(f).filter(([k, v]) => v.trim() !== contact[k as keyof Contact]).map(([k, v]) => [k, v.trim()]))
    if (!Object.keys(changed).length) { setOpen(false); return }
    setBusy(true)
    const r = await editOrderContact(orderId, changed).catch(() => ({ ok: false as const, error: 'We could not save that. Check your connection; nothing was changed.' }))
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    setOpen(false); setError(null); router.refresh()
  }
  return (
    <>
      <Button variant="secondary" onClick={() => { setF(contact); setError(null); setOpen(true) }}>Edit</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Who ${number} goes to`}
        actions={<><Button variant="secondary" data-autofocus onClick={() => setOpen(false)}>Keep as it is</Button><Button onClick={save} aria-disabled={busy}>Save</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          {FIELDS.map((x) => (
            <label key={x.key} className={`grid gap-1 text-sm ${x.key === 'addressLine' || x.key === 'customerName' ? 'sm:col-span-2' : ''}`}>
              {x.label}
              <input type={x.type ?? 'text'} inputMode={x.inputMode} value={f[x.key]} onChange={(e) => setF({ ...f, [x.key]: e.target.value })}
                className="h-10 rounded-md border border-input bg-card px-3 md:h-9" />
            </label>
          ))}
          <label className="grid gap-1 text-sm">State
            <select value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} className="h-10 rounded-md border border-input bg-card px-2 md:h-9">
              {STATES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
        </div>
        {error ? <p role="alert" className="text-sm text-danger-text">{error}</p> : null}
      </Dialog>
    </>
  )
}

export function AddNote({ orderId }: { orderId: string }) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) { setError('Write the note first.'); return }
    setBusy(true)
    const r = await addOrderNote(orderId, body).catch(() => ({ ok: false as const, error: 'We could not save that note. Check your connection.' }))
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    setBody(''); setError(null); router.refresh()
  }
  return (
    <form onSubmit={add} className="grid gap-2">
      <label htmlFor="note" className="sr-only">A note for your team</label>
      <textarea id="note" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={2} placeholder="A note for your team (the customer never sees it)"
        className="rounded-md border border-input bg-card px-3 py-2 text-sm" />
      {error ? <p role="alert" className="text-sm text-danger-text">{error}</p> : null}
      <div><Button type="submit" variant="secondary" aria-disabled={busy}>Add note</Button></div>
    </form>
  )
}
