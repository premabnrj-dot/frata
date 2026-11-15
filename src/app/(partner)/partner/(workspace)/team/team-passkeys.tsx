'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Segmented } from '@/components/ui/segmented'
import { FIELD } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import { FingerprintIcon } from '@/components/passkeys/partner-frame'
import { freshly, partnerPasskeys } from '@/components/passkeys/fresh'
import { settle } from '@/lib/settle'

// =============================================================================
// Team's passkey actions (T1b; partner sign-in mockup screens 10, 20, 22). The owner approves a Lead's first or new
// passkey with the code the Lead reads out — on a call the OWNER made ("Did you start this call yourself?": No turns
// Approve off and offers Decline); approving and deleting ask for the owner's passkey when their last check is older
// than 5 minutes (the database's rule; freshly). Context comes from the request itself: the device and the city it was asked from.
// =============================================================================

export type Waiting = { memberId: string; email: string; name: string; device: string | null; city: string | null; askedMinutes: number }

export function ApprovePasskey({ w }: { w: Waiting }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [started, setStarted] = useState<'yes' | 'no' | ''>('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const reset = () => { setStarted(''); setCode(''); setError(null) }
  const approve = async () => {
    setBusy(true); setError(null)
    const r = await freshly(() => partnerPasskeys.call('approve', { memberId: w.memberId, code }))
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setOpen(false); reset(); toast.ok(`Approved. ${w.name} can create a passkey now.`); settle(router)
  }
  const decline = async () => {
    setBusy(true); setError(null)
    const r = await partnerPasskeys.call('decline', { memberId: w.memberId })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setOpen(false); reset(); toast.ok('Request declined.'); settle(router)
  }
  const asked = w.askedMinutes < 1 ? 'Just now' : `${w.askedMinutes} min ago`
  return (
    <>
      <Button size="sm" onClick={() => { reset(); setOpen(true) }}>Approve {w.name}</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Approve a passkey" error={error}
        description={<Badge tone="warn">Waiting</Badge>}
        actions={started === 'no'
          ? <>
              <Button variant="secondary" data-autofocus busy={busy} onClick={decline}>Decline request</Button>
              <Button disabled reason="You didn’t start the call">Approve {w.name}</Button>
            </>
          : <>
              <Button variant="secondary" data-autofocus onClick={() => setOpen(false)}>Not now</Button>
              <Button busy={busy} reason={started !== 'yes' ? 'Answer the question first' : !/^\d{6}$/.test(code) ? 'Type the 6-digit code' : undefined} onClick={approve}><FingerprintIcon />Approve {w.name}</Button>
            </>}>
        <div className="grid gap-3 text-sm">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-1">
            <dt className="text-muted-foreground">Who</dt><dd className="font-medium">{w.name} · {w.email}</dd>
            {w.device && <><dt className="text-muted-foreground">Device</dt><dd>{w.device}</dd></>}
            {w.city && <><dt className="text-muted-foreground">Where</dt><dd>{w.city}</dd></>}
            <dt className="text-muted-foreground">Asked</dt><dd>{asked}</dd>
          </dl>
          <div className="grid gap-2 rounded-mid border border-border px-3 py-2.5">
            <span aria-hidden="true">Did you start this call yourself?</span>
            <Segmented<'yes' | 'no' | ''> label="Did you start this call yourself?" value={started} options={[['yes', 'Yes'], ['no', 'No']]} onPick={(v) => { setStarted(v); setError(null) }} className="w-fit" />
          </div>
          {started === 'no'
            ? <p role="status" className="rounded-mid bg-warn px-3 py-2.5 font-medium text-warn-text">Hang up and call {w.name} on a number you know.</p>
            : (
              <div className="grid gap-1.5">
                <label htmlFor={`code-${w.memberId}`} className="font-medium">Code {w.name} reads out</label>
                <input id={`code-${w.memberId}`} inputMode="numeric" autoComplete="off" value={code}
                  onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(null) }}
                  className={`${FIELD} text-center font-mono text-title tracking-widest`} />
              </div>
            )}
        </div>
      </Dialog>
    </>
  )
}

/** A lost phone (mockup screens 20, 22): delete every passkey of a Lead and sign them out on every device. */
export function DeletePasskeys({ memberId, name, count }: { memberId: string; name: string; count: number }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const words = count === 1 ? 'passkey' : `${count} passkeys`
  const go = async () => {
    setBusy(true); setError(null)
    const r = await freshly(() => partnerPasskeys.call('remove-all', { memberId }))
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setOpen(false); toast.ok(`Deleted. ${name} is signed out everywhere.`); settle(router)
  }
  return (
    <>
      <Button variant="danger" size="sm" onClick={() => { setError(null); setOpen(true) }}>Delete passkeys</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Delete ${name}’s ${words}?`} error={error}
        actions={<>
          <Button variant="secondary" data-autofocus onClick={() => setOpen(false)}>{count === 1 ? 'Keep it' : 'Keep them'}</Button>
          <Button variant="destructive" busy={busy} onClick={go}><FingerprintIcon />Delete {words}</Button>
        </>} />
    </>
  )
}
