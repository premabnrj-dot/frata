'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/** Refreshes the page (server components, the kept layout too) when a support visit runs out (plan U · T4). */
export function ExpiryRefresh({ at }: { at: string }) {
  const router = useRouter()
  useEffect(() => {
    const ms = new Date(at).getTime() - Date.now() + 500
    if (ms > 2 ** 31 - 1) return
    const t = window.setTimeout(() => router.refresh(), Math.max(0, ms))
    return () => window.clearTimeout(t)
  }, [at, router])
  return null
}
