'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { removeShopPartner } from './actions'

/** Remove the partner: it ends their access, so a dialog (design-language § Work queues 4). Buttons name both outcomes. */
export function RemovePartner({ name, shop }: { name: string; shop: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const remove = () => start(async () => {
    const r = await removeShopPartner()
    if (!r.ok) return setError(r.error)
    setOpen(false); router.refresh()
  })
  return (
    <>
      <Button variant="secondary" onClick={() => { setError(null); setOpen(true) }}>Remove</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Remove ${name} from ${shop}?`}
        description={<ul className="list-disc space-y-1 pl-5"><li>Their access ends now.</li><li>Your products, orders and settings stay.</li><li>Your price stays the same.</li></ul>}
        actions={<>
          <Button variant="secondary" data-autofocus onClick={() => setOpen(false)}>Keep {name}</Button>
          <Button variant="destructive" disabled={pending} onClick={remove}>{pending ? 'Removing…' : `Remove ${name}`}</Button>
        </>}>
        {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
      </Dialog>
    </>
  )
}
