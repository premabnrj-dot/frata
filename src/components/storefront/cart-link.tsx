'use client'

import { useEffect, useState } from 'react'
import { ATTR_KEY, bag, captureAttribution } from './bag-store'
import { parseCartLink } from '@/domains/storefront-api/cart-link'

/**
 * The bag link's island (Storefront API SA1b, plan D·1). In order: how the shopper arrived (the tab's first page, so
 * the referrer is the brand's site and its `utm_*` and `?code=` are the site's), the bag link's marker for "Your
 * website" (classifier v3), then the bag: the link's lines become the whole bag when the shopper came from the site or
 * the bag is empty, else they join it (security review L1: any site could otherwise empty a shopper's bag); then
 * checkout, on this same host. A link that doesn't read shows one state and changes nothing.
 */
export function CartLink({ site, words }: { site: string | null; words: { opening: string; broken: string; again: string; goTo: string } }) {
  const [broken, setBroken] = useState(false)
  useEffect(() => {
    const lines = parseCartLink(window.location.search)
    if (!lines) { setBroken(true); return }
    captureAttribution()
    try {
      const a = JSON.parse(sessionStorage.getItem(ATTR_KEY) ?? '{}') as Record<string, string>
      sessionStorage.setItem(ATTR_KEY, JSON.stringify({ ...a, via_site: '1' }))
    } catch { /* storage unavailable: the order reads its other evidence */ }
    if (fromSite(document.referrer, site) || bag.get().length === 0) bag.replace(lines)
    else for (const l of lines) bag.add(l.variantId, l.qty)
    window.location.replace('/checkout')
  }, [site])
  if (broken) return (
    <div className="grid justify-items-center gap-3">
      <h1 className="text-xl font-semibold" style={{ fontFamily: 'var(--store-display)' }}>{words.broken}</h1>
      <p className="opacity-80">{words.again}</p>
      <a href={site ?? '/'} className="mt-1 inline-flex min-h-11 items-center rounded-md bg-[var(--store-accent)] px-5 text-[var(--store-on-accent)]">{words.goTo}</a>
    </div>
  )
  return (
    <div role="status" className="grid justify-items-center gap-3">
      <span aria-hidden className="size-7 animate-spin rounded-full border-[3px] border-current/15 border-t-current motion-reduce:animate-none" />
      <p>{words.opening}</p>
    </div>
  )
}

/** Whether the referrer is the brand's own site (its host or its www twin). */
function fromSite(referrer: string, site: string | null): boolean {
  if (!referrer || !site) return false
  try {
    const bare = (h: string) => h.toLowerCase().replace(/^www\./, '')
    return bare(new URL(referrer).hostname) === bare(new URL(site).hostname)
  } catch { return false }
}
