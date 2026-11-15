'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { FingerprintIcon } from '@/components/passkeys/partner-frame'
import { partnerPasskeys } from '@/components/passkeys/fresh'
import { deviceLabel } from '@/domains/partners/passkeys'
import { settle } from '@/lib/settle'

/** "Add a passkey" on this device: confirms with an existing passkey first (the database wants a check in 5 minutes). */
export function AddPasskey({ label = 'Add a passkey' }: { label?: string }) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const add = async () => {
    setBusy(true); toast.dismiss()
    const r = await partnerPasskeys.addPasskey(deviceLabel(navigator.userAgent) ?? 'My passkey', true)
    setBusy(false)
    if (!r.ok) return toast.error(r.error)
    toast.ok(r.value?.name ? `Passkey saved to ${r.value.name}.` : 'Passkey saved.'); settle(router)
  }
  return <Button variant="secondary" size="sm" busy={busy} onClick={add}>{label}</Button>
}

/** Delete one of your passkeys (never the one this session used): a confirm, then your passkey. */
export function DeleteOne({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true); setError(null)
    const r = await partnerPasskeys.confirmThen('remove', { passkeyId: id })
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setOpen(false); toast.ok('Passkey deleted.'); settle(router)
  }
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => { setError(null); setOpen(true) }}>Delete</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Delete ${name}?`} error={error}
        actions={<>
          <Button variant="secondary" data-autofocus onClick={() => setOpen(false)}>Keep it</Button>
          <Button variant="destructive" busy={busy} onClick={go}><FingerprintIcon />Delete passkey</Button>
        </>} />
    </>
  )
}
