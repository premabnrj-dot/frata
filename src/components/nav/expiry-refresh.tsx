'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/**
 * Refreshes the page (server components, the kept layout too) when a support visit runs out (plan U · T4).
 * `ms` is the time left by the SERVER's clock, so a fast or slow phone clock cannot refresh early; each refresh
 * renders a new `ms`, which re-arms the timer if the visit is somehow still on (impact review U·2a).
 */
export function ExpiryRefresh({ ms: left }: { ms: number }) {
  const router = useRouter()
  useEffect(() => {
    // Past its time by the server but still shown (the database's clock behind the server's): wait 5 s, not 500 ms.
    const ms = left > 0 ? left + 500 : 5000
    if (ms > 2 ** 31 - 1) return
    const t = window.setTimeout(() => router.refresh(), Math.max(0, ms))
    return () => window.clearTimeout(t)
  }, [left, router])
  return null
}
