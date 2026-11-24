'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'

// Delivery Zones' header (O2a·9, mockup § 2 "Pickup PIN code"): for whoever may edit the store, "From 302003" or "Add
// pickup PIN code" opens the popup, which loads on first open and reads the PIN code and its version then.
const PickupPopup = dynamic(() => import('./pickup-popup').then((m) => m.PickupPopup), { ssr: false })

export function PickupPin({ pickup }: { pickup: string | null }) {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  return (
    <>
      <button type="button" className="inline-flex min-h-6 items-center text-link underline underline-offset-2" onClick={() => { setLoaded(true); setOpen(true) }}>
        {pickup ? <span>From <span className="font-mono">{pickup}</span></span> : 'Add pickup PIN code'}
      </button>
      {loaded && <PickupPopup open={open} onClose={() => setOpen(false)} />}
    </>
  )
}
