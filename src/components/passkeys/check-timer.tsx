'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { CHECK_MS, WARN_BEFORE_MS } from '@/domains/partners/passkeys'
import { passkeyClient } from './passkey-client'

// =============================================================================
// FILE: src/components/passkeys/check-timer.tsx — the 12-hour passkey check, in place (partner sign-in mockup screen
// 15): a line 10 minutes before it ends, then "Confirm it's you" over the page, so nothing typed is lost (WCAG 2.2.5).
// The clock is read only after mount and by its timer (§ Time in client components). The server refuses any workspace
// write after the 12 hours whatever this shows.
// =============================================================================

const { confirmPasskey } = passkeyClient('/partner/passkey')

export function CheckTimer({ confirmedAt }: { confirmedAt: string }) {
  const router = useRouter()
  const toast = useToast()
  const [left, setLeft] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const ends = new Date(confirmedAt).getTime() + CHECK_MS
    const read = () => setLeft(ends - Date.now()) // clock-ok: a timer, after mount
    read()
    const t = setInterval(read, 15_000)
    return () => clearInterval(t)
  }, [confirmedAt])
  const confirm = async () => {
    setBusy(true); toast.dismiss()
    const r = await confirmPasskey()
    setBusy(false)
    if (!r.ok) return toast.error(r.error)
    router.refresh()
  }
  if (left === null || left > WARN_BEFORE_MS) return null
  const minutes = Math.max(1, Math.ceil(left / 60_000))
  return (
    <>
      {left > 0 && (
        <div role="status" className="flex flex-wrap items-center gap-3 border-b border-border bg-warn px-4 py-2 text-sm font-medium text-warn-text md:px-5">
          <span>Confirm it’s you in {minutes} min</span>
          <span className="flex-1" />
          <Button size="sm" variant="secondary" busy={busy} onClick={confirm}>Use passkey</Button>
        </div>
      )}
      <Dialog open={left <= 0} onClose={() => {}} title="Confirm it’s you"
        actions={<Button busy={busy} onClick={confirm}>Use passkey</Button>} />
    </>
  )
}
