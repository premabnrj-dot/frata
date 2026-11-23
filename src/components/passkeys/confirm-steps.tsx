'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { announce } from '@/components/shell/announce'
import { deviceLabel } from '@/domains/partners/passkeys'
import { NO_PASSKEY_HERE, passkeyClient, type PasskeyEndpoint } from './passkey-client'
import { PasskeyTile } from './partner-frame'

// =============================================================================
// FILE: src/components/passkeys/confirm-steps.tsx — the three every-day screens of a passkey check, the same in Frrata
// Admin's gate and the partner workspace's gate (passkeys, simpler P0; mockup
// https://claude.ai/artifact/85e3WTLUVDFYjMnJYC2JG4 screens 1–3). Each gate keeps its own frame and its own ask flow.
//   1 Confirm it's you · Use passkey · No passkey here?      (cancelled: stays, focus on "No passkey here?")
//   2 No passkey on this browser · Use another device · Ask for a new passkey   (the list of saved passkeys: P1)
//   3 Save a passkey on this device · Save passkey · Not now (after a passkey from another device, a phone by QR)
// WebAuthn says "NotAllowedError" both when the person closed the prompt and when this browser holds none of their
// passkeys, so a closed prompt is not an error toast: screen 1 stays and offers screen 2. Anything else is a toast.
// =============================================================================

type Step = 'confirm' | 'none' | 'save'

export function ConfirmSteps({ endpoint, onAsk, onDone, canSave, headingClass, tile = true, focusOnMount = false }: {
  endpoint: PasskeyEndpoint
  /** "Ask for a new passkey": the gate's own ask flow. */
  onAsk: () => void
  /** Through: the gate reloads the page behind it. */
  onDone: () => void
  /** Fewer than 10 passkeys: screen 3 may offer this device its own. */
  canSave: boolean
  headingClass: string
  /** Screen 3's fingerprint tile; off where the frame already draws an icon (Frrata Admin's key). */
  tile?: boolean
  /** Back from the ask flow ("Use my passkey"): focus the heading at once, as a step change does. */
  focusOnMount?: boolean
}) {
  const { addPasskey, confirmPasskey } = passkeyClient(endpoint)
  const toast = useToast()
  const [step, setStep] = useState<Step>('confirm')
  const [busy, setBusy] = useState(false)
  const head = useRef<HTMLHeadingElement>(null)
  const noneLink = useRef<HTMLButtonElement>(null)
  const first = useRef(!focusOnMount)
  // Each step replaces the focused control: focus moves to the new heading, which a screen reader reads.
  useEffect(() => { if (first.current) { first.current = false; return } head.current?.focus() }, [step])

  const confirm = async () => {
    setBusy(true); toast.dismiss()
    const r = await confirmPasskey()
    setBusy(false)
    if (r.ok) { if (r.value?.crossDevice && canSave) setStep('save'); else onDone(); return }
    // Closed, or nothing here: not an error. Said politely; on screen 1 focus moves to "No passkey here?", on screen 2 it
    // stays on "Use another device" (busy kept it there).
    if (r.error === NO_PASSKEY_HERE) { announce('Not confirmed.'); if (step === 'confirm') noneLink.current?.focus(); return }
    toast.error(r.error)
  }
  const save = async () => {
    setBusy(true); toast.dismiss()
    const r = await addPasskey(deviceLabel(navigator.userAgent) ?? 'My passkey', false, false)
    setBusy(false)
    if (!r.ok) { toast.error(r.error); return }
    // No ok toast: the reload replaces the gate and its Toaster, and the page that opens is the confirmation.
    onDone()
  }

  const heading = (text: string) => <h1 ref={head} tabIndex={-1} className={`${headingClass} outline-none`}>{text}</h1>
  if (step === 'save') {
    return (
      <>
        {tile && <PasskeyTile />}
        {heading('Save a passkey on this device')}
        <p className="text-sm text-muted-foreground">Anyone who can unlock this device can sign in.</p>
        <Button size="lg" busy={busy} onClick={save}>Save passkey</Button>
        <Button variant="link" className="justify-self-start" onClick={onDone}>Not now</Button>
      </>
    )
  }
  if (step === 'none') {
    return (
      <>
        {heading('No passkey on this browser')}
        <Button size="lg" busy={busy} onClick={confirm}>Use another device</Button>
        <Button variant="link" className="justify-self-start" onClick={onAsk}>Ask for a new passkey</Button>
      </>
    )
  }
  return (
    <>
      {heading('Confirm it’s you')}
      <Button size="lg" busy={busy} onClick={confirm}>Use passkey</Button>
      <Button ref={noneLink} variant="link" className="justify-self-start" onClick={() => setStep('none')}>No passkey here?</Button>
    </>
  )
}
