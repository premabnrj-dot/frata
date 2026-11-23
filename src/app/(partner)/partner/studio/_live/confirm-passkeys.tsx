'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

// Studio's entry state 1b (owner 2026-11-23, docs/mockups/2026-11-23-studio-door.html): one button for the checks this
// sign-in still needs, the staff passkey first, then the partner passkey, each its own prompt through the existing
// passkey routes. The passkey code loads only when pressed (the page's script pin).
export function ConfirmPasskeys({ staff, partner }: { staff: boolean; partner: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true); toast.dismiss()
    const { passkeyClient } = await import('@/components/passkeys/passkey-client')
    for (const endpoint of [...(staff ? [] : ['/admin/passkey' as const]), ...(partner ? [] : ['/partner/passkey' as const])]) {
      const r = await passkeyClient(endpoint).confirmPasskey()
      if (!r.ok) { toast.error(r.error); break }
    }
    router.refresh()
    setBusy(false)
  }
  return <Button size="sm" busy={busy} onClick={go}>{staff ? 'Confirm partner passkey' : 'Confirm staff passkey'}</Button>
}
