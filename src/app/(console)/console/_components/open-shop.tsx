'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { closeShop } from '../shop-actions'
import { useOpenMoment } from './open-moment'

/**
 * Closing the store for now (/console/setup, ux rule 30): asks once, orders are kept. Opening is the setup card's "Open
 * your store?" (O2a·8, setup/open-store.tsx), which also draws D0·3's refusal.
 */
export function OpenShop({ open, canManage }: { open: boolean; canManage: boolean }) {
  const [ask, setAsk] = useState(false)
  const toast = useToast()
  const moment = useOpenMoment()
  // Busy is this button's own, for the action's round trip only — never a React transition (e2e 90-ux, 2026-11-09).
  const [pending, setPending] = useState(false)
  // What the last close made true, until the page's own render agrees (a late, stale render must not offer it again).
  const [closed, setClosed] = useState(false)
  const askRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const back = useRef(false)
  useEffect(() => { if (!open) setClosed(false) }, [open])
  const run = async () => {
    if (pending) return
    setPending(true)
    try {
      const r = await closeShop()
      if (!r.ok) toast.error(r.error)
      else { toast.ok('Closed. Shoppers see “Opening soon”.'); setClosed(true); moment?.closed() }
      setAsk(false)
    } catch {
      toast.error('We couldn’t reach Frrata.', { sub: 'Nothing was changed. Try again.' })
    } finally {
      setPending(false)
    }
    // No router.refresh(): the action's revalidatePath already re-renders this page.
  }
  // The question takes focus when it appears (the button that asked it is gone); dismissing it gives focus back.
  useEffect(() => { if (ask) askRef.current?.focus(); else if (back.current) { back.current = false; triggerRef.current?.focus() } }, [ask])
  if (!canManage || !open || closed) return null
  return ask
    ? <div ref={askRef} tabIndex={-1} role="group" aria-label="Close your store?" className="flex flex-wrap items-center gap-3 text-sm outline-none"><span><b className="font-semibold">Close your store?</b> Shoppers can’t place orders until you open it.</span><Button variant="secondary" className="after:hidden" /* undoes something: no thread (brand rule 37) */ disabled={pending} onClick={() => void run()}>Close store</Button><button type="button" className="inline-flex min-h-6 items-center underline" onClick={() => { setAsk(false); back.current = true }}>Keep it open</button></div>
    : <button type="button" className="inline-flex min-h-6 items-center text-sm underline" onClick={() => setAsk(true)} ref={triggerRef}>Close the store for now</button>
}
