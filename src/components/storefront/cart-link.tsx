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
    <div className="space-y-3">
      <h1 className="text-xl font-semibold" style={{ fontFamily: 'var(--store-display)' }}>{words.broken}</h1>
      <p className="text-store-sub">{words.again}</p>
      <p><a href={site ?? '/'} className="store-btn inline-flex min-h-11 items-center gap-2 rounded-[var(--store-radius)] bg-store-button px-5 text-sm font-medium text-store-on-button">{words.goTo}</a></p>
    </div>
  )
  return (
    // The spinner is SVG's own animation (no CSS added to the shop's sheet, budget 15.9 kB); a reduced-motion browser
    // still sees the words, and the page lasts under a second.
    <div role="status" className="grid place-items-center gap-3 text-store-sub">
      <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" opacity=".25" />
        <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite" /></path></svg>
      <p>{words.opening}</p></div>
  )
}

/** Whether the referrer is the brand's own site (its host or its www twin). */
function fromSite(referrer: string, site: string | null): boolean {
  if (!referrer || !site) return false
  try {
    // The same site, www on either side (siteHostKey's rule, copied: this island stays small).
    const bare = (h: string) => h.toLowerCase().replace(/\.$/, '').replace(/^www\./, '')
    return bare(new URL(referrer).hostname) === bare(new URL(site).hostname)
  } catch { return false }
}
