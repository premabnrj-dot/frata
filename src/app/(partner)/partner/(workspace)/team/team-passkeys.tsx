'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { FingerprintIcon } from '@/components/passkeys/partner-frame'
import { partnerPasskeys } from '@/components/passkeys/fresh'
import { settle } from '@/lib/settle'

// =============================================================================
// Team's passkey actions (T1b; partner sign-in mockup screens 10, 20, 22). The owner approves a Lead's first or new
// passkey with the code the Lead reads out — on a call the OWNER made ("Did you start this call yourself?": No turns
// Approve off and offers Decline); approving and deleting ask for the owner's passkey first (the database wants a
// check in the last 5 minutes). Context comes from the request itself: the device and the city it was asked from.
// =============================================================================

export type Waiting = { memberId: string; email: string; name: string; device: string | null; city: string | null; askedMinutes: number }

export function ApprovePasskey({ w }: { w: Waiting }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [started, setStarted] = useState<boolean | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const reset = () => { setStarted(null); setCode(''); setError(null) }
  const approve = async () => {
    setBusy(true); setError(null)
    const r = await partnerPasskeys.confirmThen('approve', { memberId: w.memberId, code })
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
        actions={started === false
          ? <>
              <Button variant="secondary" data-autofocus busy={busy} onClick={decline}>Decline request</Button>
              <Button disabled reason="You didn’t start the call">Approve {w.name}</Button>
            </>
          : <>
              <Button variant="secondary" data-autofocus onClick={() => setOpen(false)}>Not now</Button>
              <Button busy={busy} disabled={started !== true || !/^\d{6}$/.test(code)} onClick={approve}><FingerprintIcon />Approve {w.name}</Button>
            </>}>
        <div className="grid gap-3 text-sm">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-1">
            <dt className="text-muted-foreground">Who</dt><dd className="font-medium">{w.name} · <span className="font-num">{w.email}</span></dd>
            {w.device && <><dt className="text-muted-foreground">Device</dt><dd>{w.device}</dd></>}
            {w.city && <><dt className="text-muted-foreground">Where</dt><dd>{w.city}</dd></>}
            <dt className="text-muted-foreground">Asked</dt><dd>{asked}</dd>
          </dl>
          <fieldset className="grid gap-2 rounded-lg border border-border px-3 py-2.5">
            <legend className="sr-only">Did you start this call yourself?</legend>
            <span aria-hidden="true">Did you start this call yourself?</span>
            <div role="radiogroup" aria-label="Did you start this call yourself?" className="inline-flex w-fit rounded-md bg-muted p-0.5">
              {([['Yes', true], ['No', false]] as const).map(([label, v]) => (
                <button key={label} type="button" role="radio" aria-checked={started === v} onClick={() => { setStarted(v); setError(null) }}
                  className="min-h-[30px] rounded-[6px] px-3 text-sm aria-checked:bg-card aria-checked:shadow-sm">{label}</button>
              ))}
            </div>
          </fieldset>
          {started === false
            ? <p className="rounded-lg bg-warn px-3 py-2.5 font-medium text-warn-text">Hang up and call {w.name} on a number you know.</p>
            : (
              <div className="grid gap-1.5">
                <label htmlFor={`code-${w.memberId}`} className="font-medium">Code {w.name} reads out</label>
                <input id={`code-${w.memberId}`} inputMode="numeric" autoComplete="off" maxLength={6} value={code}
                  onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(null) }}
                  className="h-11 w-full rounded-md border border-input bg-card px-3 text-center font-mono text-[1.375rem] tracking-[0.32em]" />
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
    const r = await partnerPasskeys.confirmThen('remove-all', { memberId })
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
