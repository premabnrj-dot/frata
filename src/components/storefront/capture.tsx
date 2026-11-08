'use client'

import { useEffect } from 'react'
import { captureAttribution } from './bag-store'

/**
 * How the shopper arrived (Analytics A·1, plan review 9; speed review: its own island, importing only the bag store,
 * 0.5 kB). In the shop shell on every page, so any landing counts, not only pages with a bag button. `capture` is off in
 * the console's previews, and the capture itself refuses the console's own address too.
 */
export function CaptureAttribution({ capture }: { capture: boolean }) {
  useEffect(() => { if (capture) captureAttribution() }, [capture])
  return null
}
