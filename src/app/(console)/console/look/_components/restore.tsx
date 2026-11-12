'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { restoreLookAction } from '../actions'

/** Restore: asks first when it would replace an open draft (Look v3 § Confirmations). */
export function RestoreButton({ revisionId, when, replacesDraft = false }: { revisionId: string; when?: string; replacesDraft?: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const toast = useToast()
  const [ask, setAsk] = useState(false)
  const go = () => start(async () => { setAsk(false); const r = await restoreLookAction({ revisionId }); if (!r.ok) toast.error(r.error); else router.push('/console/look/customize') })
  return (
    <span className="flex items-center gap-2">
      <Button variant="secondary" disabled={pending} onClick={() => (replacesDraft ? setAsk(true) : go())}>Restore</Button>
      <Dialog open={ask} onClose={() => setAsk(false)} title={when ? `Restore the look from ${when}?` : 'Restore this look?'} description="It opens as a draft and replaces the one you have. Your shop doesn’t change."
        actions={<><Button variant="secondary" className="after:hidden" data-autofocus onClick={() => setAsk(false)}>Cancel</Button><Button disabled={pending} onClick={go}>Restore as draft</Button></>} />
    </span>
  )
}
