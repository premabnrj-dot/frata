'use client'

import { useEffect } from 'react'

/**
 * A shop's OLD name (shop addresses D·1): the page still renders (its canonical already names the current address), and
 * the browser moves to the same path, query and #fragment on the current address — so a shared Instagram link keeps
 * its tags for Analytics. Order pages stay where their token was issued (security review: never cross-host).
 */
export function MovedTo({ to, children }: { to: string; children: React.ReactNode }) {
  useEffect(() => {
    const { protocol, pathname, search, hash } = window.location
    if (pathname === '/orders' || pathname.startsWith('/orders/')) return
    // The target is built from our own host and the current location's parts: never a URL a shopper typed.
    window.location.replace(`${protocol}//${to}${pathname}${search}${hash}`)
  }, [to])
  return children
}
