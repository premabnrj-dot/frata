'use client'

import { useEffect } from 'react'

/**
 * How the shopper arrived (Analytics A·1, plan review 9; speed review: its own island, through the bag store and the
 * pure attribution module, ~1 kB), in its own chunk loaded once the page has run: the shell's first load doesn't carry it
 * (check:storefront-build). A chunk that cannot load (no connection) records nothing, as storage that refuses does. In
 * the shop shell of the real shop, so any landing counts, not only pages with a bag button. `capture` is false in the
 * console's previews, and the capture itself refuses the console's own address too.
 */
export function CaptureAttribution({ capture }: { capture: boolean }) {
  useEffect(() => { if (capture) void import('./capture-attribution').then((m) => m.captureAttribution(), () => {}) }, [capture])
  return null
}
