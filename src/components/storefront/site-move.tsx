'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { SITE_MOVE_GUARD_MS, siteMove } from '@/domains/addresses/names'

/**
 * The move to the brand's own website on a soft navigation (a layout doesn't remount: architecture review 3). The first
 * page is moved by the head's inline script (siteMoveScript) before it paints; this repeats the same rule, with the same
 * one-hop guard, whenever the path changes inside the store (from the bag to a product, say).
 */
export function SiteMove({ origin }: { origin: string }) {
  const path = usePathname()
  useEffect(() => {
    const to = siteMove(origin, window.location)
    if (!to) return
    try {
      const k = 'frrata.move', n = Date.now(), l = Number(sessionStorage.getItem(k) || 0) // clock-ok: browser guard, never shown
      if (n - l < SITE_MOVE_GUARD_MS) return
      sessionStorage.setItem(k, String(n))
    } catch { /* storage unavailable: move anyway; the host check still stops a loop on the site's own host */ }
    window.location.replace(to)
  }, [origin, path])
  return null
}
