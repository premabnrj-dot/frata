'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Section } from '@/components/layout/section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { confirmPasskey } from '@/components/passkeys/passkey-client'
import { setPasskeysAction } from './actions'

/** "Turn passkeys on" (the banner's and the row's): no passkey asked; a refusal says why (impact review, 2026-11-23). */
export function TurnPasskeysOn({ variant = 'primary' }: { variant?: 'primary' | 'secondary' }) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const on = async () => {
    setBusy(true)
    const r = await setPasskeysAction(false).catch(() => ({ ok: false as const, error: 'Passkeys stay as they were. Try again.' }))
    setBusy(false)
    if (!r.ok) return toast.error(r.error)
    router.refresh()
  }
  return <Button variant={variant} size="sm" busy={busy} onClick={on}>Turn passkeys on</Button>
}

// Admin › Staff's Passkeys row (owner 2026-11-23, docs/mockups/2026-11-23-admin-passkeys-switch.html): on or off for
// everyone. An Admin turns them off after their own passkey confirms (the database asks for it), or on with none. Support
// staff read the state only.
export function PasskeysSwitch({ off, since, admin }: { off: boolean; since: string | null; admin: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const close = () => { if (!busy) { setOpen(false); setError(null) } }
  const turnOff = async () => {
    setBusy(true); setError(null)
    const c = await confirmPasskey()
    const r = c.ok ? await setPasskeysAction(true) : { ok: false as const, error: c.error }
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setOpen(false); router.refresh()
  }
  return (
    <Section ariaLabel="Passkeys" className="text-sm"><div className="flex flex-wrap items-center gap-3">
      <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Passkeys</span>
      <span className="flex min-w-0 flex-[1_1_12rem] flex-wrap items-center gap-2">
        <Badge tone={off ? 'warn' : 'ok'}>{off ? 'Off' : 'On'}</Badge>
        {off && since && <span className="text-muted-foreground">{since}</span>}
      </span>
      {admin && (off
        ? <TurnPasskeysOn variant="secondary" />
        : <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>Turn passkeys off</Button>)}
      <Dialog open={open} onClose={close} title="Turn passkeys off?" error={error}
        description="Staff and partners will sign in with an email code alone. Passkeys stay off until a master admin turns them on."
        actions={<>
          <Button variant="secondary" data-autofocus disabled={busy} onClick={close}>Keep passkeys on</Button>
          <Button busy={busy} onClick={turnOff}>{busy ? 'Turning passkeys off…' : 'Turn passkeys off'}</Button>
        </>} />
    </div></Section>
  )
}
