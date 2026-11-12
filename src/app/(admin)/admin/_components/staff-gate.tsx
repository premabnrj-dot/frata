'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Section } from '@/components/layout/section'
import type { GateState } from '@/lib/admin/passkeys'
import { useToast } from '@/components/ui/toast'
import { addPasskey, confirmPasskey, requestCode } from './passkey-client'

// =============================================================================
// FILE: src/app/(admin)/admin/_components/staff-gate.tsx — what Admin shows instead of any page until this browser
// session has passed a passkey check (mockup https://claude.ai/artifact/Xng3BV15YZpDQi9MoYLGsZ). Confirm with a
// passkey; with none, ask for one (a code another admin types to approve) and, once approved, add it on this browser.
// A failure is an error toast (§ Feedback 1): the layout wraps the gate in its own calm Toaster.
// =============================================================================

function Key() {
  return (
    <span className="grid size-11 place-items-center rounded-lg bg-muted" aria-hidden="true">
      <svg viewBox="0 0 24 24" className="size-6 fill-none stroke-current" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="12" r="4" /><path d="M12 12h9M18 12v3M21 12v2" /></svg>
    </span>
  )
}

export function StaffGate({ email, state, signOut }: { email: string; state: GateState | null; signOut: React.ReactNode }) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const [name, setName] = useState('')
  const request = state?.request ?? null
  const waiting = !!request && !request.approved
  // While a request waits for its approval, look again every 5 s (the approval lands on the server).
  useEffect(() => {
    if (!waiting) return
    const t = setInterval(() => router.refresh(), 5000)
    return () => clearInterval(t)
  }, [waiting, router])

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true); toast.dismiss()
    const r = await fn()
    setBusy(false)
    if (!r.ok) toast.error(r.error ?? 'Something went wrong. Try again.'); else router.refresh()
  }

  let body: React.ReactNode
  if (!state) {
    body = <><h1 className="text-xl font-semibold">Sign in again</h1></>
  } else if (request?.approved) {
    body = (
      <>
        <h1 className="text-xl font-semibold">Add a passkey</h1>
        <p className="text-sm text-muted-foreground">Approved by {request.approvedBy ?? 'Frrata'}</p>
        <label htmlFor="pk-name" className="grid gap-1.5 text-sm font-medium">Name
          <input id="pk-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="My laptop"
            className="h-10 rounded-md border border-input bg-card px-3 text-sm md:h-9" />
        </label>
        <Button disabled={busy || !name.trim()} onClick={() => run(() => addPasskey(name.trim()))}>{busy ? 'Waiting for your device…' : 'Add passkey'}</Button>
      </>
    )
  } else if (waiting || asking || state.passkeys === 0) {
    body = (
      <>
        <h1 className="text-xl font-semibold">Add a passkey</h1>
        {code ? (
          <>
            <p className="text-sm text-muted-foreground">Read this code to an admin</p>
            <p className="font-mono text-3xl font-semibold tracking-[0.18em] tabular-nums" aria-live="polite">{code.slice(0, 3)} {code.slice(3)}</p>
            <Button disabled aria-disabled>Waiting for approval</Button>
          </>
        ) : (
          <Button disabled={busy} onClick={() => run(async () => { const r = await requestCode(); if (r.ok && r.value) setCode(r.value.code); return r.ok ? { ok: true } : r })}>
            {waiting ? 'Show a new code' : 'Ask to add a passkey'}
          </Button>
        )}
        {state.passkeys > 0 && <button type="button" className="justify-self-start text-sm underline underline-offset-4" onClick={() => { setAsking(false); setCode(null) }}>Use my passkey</button>}
      </>
    )
  } else {
    body = (
      <>
        <h1 className="text-xl font-semibold">Confirm it&apos;s you</h1>
        <Button disabled={busy} onClick={() => run(confirmPasskey)}>{busy ? 'Waiting for your device…' : 'Use passkey'}</Button>
        <button type="button" className="justify-self-start text-sm underline underline-offset-4" onClick={() => setAsking(true)}>Lost your passkeys?</button>
      </>
    )
  }
  return (
    <main data-shell className="grid min-h-dvh place-items-center p-6">
      <Section className="grid w-full max-w-sm gap-4">
        <Key />
        {body}
        <p className="font-mono text-sm text-muted-foreground">{email}</p>
        {signOut}
      </Section>
    </main>
  )
}
