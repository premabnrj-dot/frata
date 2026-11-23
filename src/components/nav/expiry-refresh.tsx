'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { settle } from '@/lib/settle'

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
    // settle, not one refresh: a refresh that lands while the page's response still streams (the nav's counts) can be
    // dropped by Next 15.5 (frata-gotchas), and the banner then stayed after the visit ended (page weight 2026-11-23:
    // lighter pages load sooner and met it in 2 of 36 e2e rounds). The second refresh carries the same, newest state.
    const t = window.setTimeout(() => settle(router), Math.max(0, ms))
    return () => window.clearTimeout(t)
  }, [left, router])
  return null
}
