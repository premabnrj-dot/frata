'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { settle } from '@/lib/settle'
import { takeMoreDays } from './actions'

/**
 * The owner's one 7-day extension (trials TR1·7). Plain pending state and settle(router) after the action, never a
 * transition: Next 15.5 leaves a transition around an action + refresh unsettled now and then (frata-gotchas), which
 * kept this button disabled and the banner up after the extension had been saved (e2e 63, 2026-11-15).
 */
export function TakeMoreDays() {
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const router = useRouter()
  const take = async () => {
    setBusy(true)
    try {
      const r = await takeMoreDays()
      if (!r.ok) toast.error(r.error)
      else settle(router)
    } catch {
      toast.error('We could not reach Frrata. Nothing was changed.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <span className="inline-flex items-center gap-2">
      <Button variant="secondary" disabled={busy} onClick={take}>Take 7 more days</Button>
    </span>
  )
}
