'use client'

import { useEffect } from 'react'
import { movedUrl } from '@/domains/addresses/names'

/**
 * A shop's OLD name (shop addresses D·1): the page still renders (its canonical already names the current address), and
 * the browser moves to the same path, query and #fragment on the current address — so a shared Instagram link keeps
 * its tags for Analytics. Order pages stay where their token was issued (security review: never cross-host).
 */
export function MovedTo({ to, children }: { to: string; children: React.ReactNode }) {
  useEffect(() => {
    const url = movedUrl(to, window.location)
    if (url) window.location.replace(url)
  }, [to])
  return children
}
