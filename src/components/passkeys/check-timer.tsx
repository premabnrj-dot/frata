'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Banner } from '@/components/ui/banner'
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

/** `signOut`: the dialog's other way out once the check has ended (a server form from the layout). */
export function CheckTimer({ confirmedAt, signOut }: { confirmedAt: string; signOut: React.ReactNode }) {
  const router = useRouter()
  const toast = useToast()
  const [left, setLeft] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The minutes said once, when the line appears: a status line that changes every minute is read out every minute.
  const [warnedAt, setWarnedAt] = useState<number | null>(null)
  useEffect(() => {
    const ends = new Date(confirmedAt).getTime() + CHECK_MS
    const read = () => setLeft(ends - Date.now()) // clock-ok: a timer, after mount
    read()
    const t = setInterval(read, 15_000)
    return () => clearInterval(t)
  }, [confirmedAt])
  const confirm = async () => {
    setBusy(true); toast.dismiss(); setError(null)
    const r = await confirmPasskey()
    setBusy(false)
    if (!r.ok) { if (left !== null && left <= 0) setError(r.error); else toast.error(r.error); return }
    setWarnedAt(null); router.refresh()
  }
  useEffect(() => { if (left !== null && left > 0 && left <= WARN_BEFORE_MS && warnedAt === null) setWarnedAt(Math.max(1, Math.ceil(left / 60_000))) }, [left, warnedAt])
  if (left === null || left > WARN_BEFORE_MS) return null
  return (
    <>
      {left > 0 && warnedAt !== null && (
        <Banner tone="warn" className="mb-3" title={`Confirm it’s you in ${warnedAt} min`}
          action={<Button size="sm" variant="secondary" busy={busy} onClick={confirm}>Use passkey</Button>} />
      )}
      <Dialog open={left <= 0} onClose={() => {}} title="Confirm it’s you" error={error}
        actions={<>{signOut}<Button data-autofocus busy={busy} onClick={confirm}>Use passkey</Button></>} />
    </>
  )
}
