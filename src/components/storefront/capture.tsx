'use client'

import { useEffect } from 'react'
import { landingNow } from './landing'

/**
 * How the shopper arrived (Analytics A·1, plan review 9; speed review: its own island, through the bag store and the
 * pure attribution module, ~1 kB), in its own chunk loaded once the page has run: the shell's first load doesn't carry it
 * (check:storefront-build). Where the shopper landed is read here, at once, and handed over, so a tap that moves the page
 * before the chunk is in (a tile's client navigation) keeps the landing's tags and code. A chunk that cannot load is
 * tried twice more, 5 s apart. In the shop shell of the real shop, so any landing counts, not only pages with a bag
 * button. `capture` is false in the console's previews, and the capture itself refuses the console's own address too.
 */
export function CaptureAttribution({ capture }: { capture: boolean }) {
  useEffect(() => {
    if (!capture) return
    const at = landingNow()
    let tries = 0, t: ReturnType<typeof setTimeout> | undefined
    const go = () => void import('./capture-attribution').then((m) => m.captureAttribution(at), () => { if (++tries < 3) t = setTimeout(go, 5000) })
    go()
    return () => clearTimeout(t)
  }, [capture])
  return null
}
