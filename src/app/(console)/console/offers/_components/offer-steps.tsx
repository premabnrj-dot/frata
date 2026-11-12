'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import type { OfferStatus } from '@/domains/checkout/offer-status'
import { stepOffer } from '../actions'

/** Start, pause, resume, end — the one primary action for the offer's state; ending asks first (it is final). */
export function OfferSteps({ id, status, title }: { id: string; status: OfferStatus; title: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const toast = useToast()
  const [ending, setEnding] = useState(false)
  // Ending's refusal stays in its dialog (§ Feedback 4); the other steps' in a toast.
  const [endError, setEndError] = useState<string | null>(null)
  const close = () => { setEnding(false); setEndError(null) }
  const run = (step: 'start' | 'pause' | 'resume' | 'end') => start(async () => {
    const r = await stepOffer(id, step)
    if (!r.ok) { if (step === 'end') setEndError(r.error); else toast.error(r.error); return }
    close()
    toast.ok(step === 'start' ? 'Started.' : step === 'pause' ? 'Paused. Shoppers no longer get it.' : step === 'resume' ? 'Running again.' : 'Ended.')
    router.refresh()
  })
  if (status === 'ended') return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === 'draft' && <Button onClick={() => run('start')} disabled={pending}>Start</Button>}
      {(status === 'live' || status === 'scheduled') && <Button variant="secondary" onClick={() => run('pause')} disabled={pending}>Pause</Button>}
      {status === 'paused' && <Button onClick={() => run('resume')} disabled={pending}>Resume</Button>}
      <Button variant={status === 'stopped' ? 'secondary' : 'ghost'} onClick={() => setEnding(true)} disabled={pending}>End offer</Button>
      <Dialog open={ending} onClose={close} error={endError} title={`End “${title}”?`} description="Shoppers stop getting it now, and it never comes back. Orders that used it keep their discount. To run it again later, make a new offer."
        actions={<><Button variant="secondary" onClick={close}>Keep it</Button><Button variant="destructive" onClick={() => run('end')} disabled={pending}>End offer</Button></>} />
    </div>
  )
}
