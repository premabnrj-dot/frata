'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { confirmPasskey } from '@/components/passkeys/passkey-client'
import { settle } from '@/lib/settle'
import { dateTimeIN } from '@/lib/format-date'
import type { OwnerPasskeys } from '@/lib/admin/partner-passkeys'
import { approveOwnerPasskeyAction, deleteOwnerPasskeysAction } from './actions'

/**
 * Admin › Partners › the owner's passkeys (T1b; partner sign-in mockup screens 11, 21): Frrata approves a partner
 * owner's first or lost passkey. Call the phone on the partner's record yourself, hear the code, type it. A recovery
 * (the owner already had a passkey) opens 24 hours after it was asked. Each step confirms your own passkey first.
 */
export function OwnerPasskeysPanel({ partnerId, s, now, admin }: { partnerId: string; s: NonNullable<OwnerPasskeys>; now: string; admin: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const r = s.request
  const opens = r?.opensAt && new Date(r.opensAt) > new Date(now) ? new Date(r.opensAt) : null
  const run = async (fn: () => Promise<{ ok: true; text: string } | { ok: false; error: string }>, done: () => void) => {
    setBusy(true); toast.dismiss(); setError(null)
    const c = await confirmPasskey()
    const res = c.ok ? await fn() : c
    setBusy(false)
    if (!res.ok) { setError(res.error); return toast.error(res.error) }
    done(); toast.ok(res.text); settle(router)
  }
  return (
    <div className="space-y-2 border-t border-border pt-4 text-sm">
      <h3 className="font-semibold">Owner’s passkeys</h3>
      <p className="text-muted-foreground"><span className="font-num">{s.owner}</span> · {s.passkeys} {s.passkeys === 1 ? 'passkey' : 'passkeys'}</p>
      {r && !r.approved && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center gap-2"><span className="font-medium">Asked for a new passkey</span><Badge tone="warn">{opens ? 'Waiting 24 hours' : 'Waiting'}</Badge></div>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">Call</dt><dd className="font-num">{s.phone}</dd>
            {r.device && <><dt className="text-muted-foreground">Device</dt><dd>{r.device}</dd></>}
            {r.city && <><dt className="text-muted-foreground">Where</dt><dd>{r.city}</dd></>}
          </dl>
          {opens ? <p className="text-muted-foreground">Opens <span className="font-num">{dateTimeIN(opens)}</span></p> : admin && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="grid gap-1.5 font-medium">Code the owner reads out
                <input inputMode="numeric" autoComplete="off" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="h-11 w-40 rounded-md border border-input bg-card px-3 text-center font-mono text-lg tracking-[0.3em] md:h-9" />
              </label>
              <Button busy={busy} disabled={!/^\d{6}$/.test(code)} onClick={() => run(() => approveOwnerPasskeyAction({ id: partnerId, code }), () => setCode(''))}>Approve</Button>
            </div>
          )}
        </div>
      )}
      {admin && s.passkeys > 0 && (
        <>
          <Button variant="danger" size="sm" onClick={() => { setError(null); setOpen(true) }}>Delete the owner’s passkeys</Button>
          <Dialog open={open} onClose={() => setOpen(false)} title={`Delete ${s.owner}’s ${s.passkeys === 1 ? 'passkey' : `${s.passkeys} passkeys`}?`} error={error}
            description="They are signed out everywhere and need a new passkey approved by Frrata."
            actions={<>
              <Button variant="secondary" data-autofocus onClick={() => setOpen(false)}>Keep them</Button>
              <Button variant="destructive" busy={busy} onClick={() => run(() => deleteOwnerPasskeysAction({ id: partnerId }), () => setOpen(false))}>Delete passkeys</Button>
            </>} />
        </>
      )}
    </div>
  )
}
