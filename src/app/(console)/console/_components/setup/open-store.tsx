'use client'

import Link from 'next/link'
import { useState } from 'react'
import { PictoTile } from '@/components/brand/illustrations'
import { Button, button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { openShop } from '../../shop-actions'
import { useOpenMoment } from '../open-moment'

// "Open your store?" (mockup § 2 `#ov-open`, O2a·8) WITHOUT the plan radios and the charge line, which are O2b's
// (plan § Deviations 1): the store pictogram, "Not yet" (focused: the safe one) and "Open store" → openShop(), as
// before. A refusal stays in the popup's error slot. D0·3's refusal (the website still on a Test key) closes this and
// opens its own dialog, never two at once. Opening hands over to the open moment (OpenMoment).

export function OpenStore({ open, onClose }: { open: boolean; onClose: () => void }) {
  const moment = useOpenMoment()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notReady, setNotReady] = useState(false)
  const go = async () => {
    if (busy) return
    setBusy(true); setError(null)
    try {
      const r = await openShop()
      if (r.ok) { onClose(); moment?.opened(); return }
      if (r.website) { onClose(); setNotReady(true); return }
      setError(r.error)
    } catch {
      setError('We couldn’t reach Frrata. Nothing was changed. Try again.')
    } finally { setBusy(false) }
  }
  return (
    <>
      <Dialog open={open} className="w-[min(27.5rem,calc(100vw-2rem))]" onClose={onClose} picto={<PictoTile name="store" tone="haldi" size="sm" />} title="Open your store?" error={error}
        actions={<><Button variant="secondary" data-autofocus onClick={onClose}>Not yet</Button><Button busy={busy} onClick={() => void go()}>Open store</Button></>} />
      <Dialog open={notReady} onClose={() => setNotReady(false)} title="Your store is still closed"
        actions={<><Link href="/console/settings/web-address" onClick={() => setNotReady(false)} className={button({ variant: 'primary' })}>Connect my domain</Link><Button variant="ghost" data-autofocus onClick={() => setNotReady(false)}>Keep it closed</Button></>}>
        <p>Your website runs on a Test key. Test keys stop when the store opens.</p>
      </Dialog>
    </>
  )
}
