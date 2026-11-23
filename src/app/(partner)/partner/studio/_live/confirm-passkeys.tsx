'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { STUDIO_CHECKS, type StudioCheck } from './checks'

// Studio's entry state 1b (owner 2026-11-23, docs/mockups/2026-11-23-studio-door.html): one button for the checks this
// sign-in still needs, in STUDIO_CHECKS's order, each its own prompt through the existing passkey routes. The passkey
// code loads only when pressed (the page's script pin).
export function ConfirmPasskeys({ done }: { done: StudioCheck[] }) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const left = STUDIO_CHECKS.filter((c) => !done.includes(c.key))
  const go = async () => {
    setBusy(true); toast.dismiss()
    try {
      const { passkeyClient } = await import('@/components/passkeys/passkey-client')
      for (const c of left) {
        const r = await passkeyClient(c.endpoint).confirmPasskey()
        if (!r.ok) { toast.error(r.error); break }
        toast.ok(c.done) // read out: the list changes on refresh
      }
    } catch {
      toast.error('Not confirmed. Try again.')
    } finally {
      router.refresh()
      setBusy(false)
    }
  }
  return left[0] ? <Button size="sm" busy={busy} onClick={go}>{left[0].button}</Button> : null
}
