'use client'

import { isTagged, landingParams } from '@/domains/analytics/attribution'
import { ATTR_KEY, offerCode } from './bag-store'

// Apart from the bag store, which every shop page loads first: the shell's capture (capture.tsx) loads this in its own
// chunk once the page has run; the bag link (cart-link.tsx) imports it.
const SEEN_KEY = 'frrata.attr.seen'
/**
 * Remember how the shopper arrived, for this tab, so the order can say where it came from (Analytics A·1; the keys are
 * the domain's ATTRIBUTION_KEYS). A tagged landing (utm or a click id) replaces the whole touch; the referring site is
 * read once, on the tab's first page, and kept as its hostname only (never a path or query). Never on the console's
 * own address (a preview), and a creator's `?code=` still fills the code, credited as a link.
 */
let capturedAt: string | null = null
export function captureAttribution() {
  try {
    if (window.location.pathname.startsWith('/console')) return
    // Once per page: a second run (React's dev double effect, the shell mounting again) must not rewrite the touch.
    if (capturedAt === window.location.href) return
    capturedAt = window.location.href
    const landing = landingParams(window.location.search)
    const first = !sessionStorage.getItem(SEEN_KEY)
    let ref: string | null = null
    if (first && document.referrer) {
      try { const u = new URL(document.referrer); ref = u.hostname || null } catch { /* not a URL */ }
      if (ref === window.location.hostname) ref = null
    }
    if (isTagged(landing)) sessionStorage.setItem(ATTR_KEY, JSON.stringify(ref ? { ...landing, ref_host: ref } : landing))
    else if (ref) sessionStorage.setItem(ATTR_KEY, JSON.stringify({ ref_host: ref }))
    sessionStorage.setItem(SEEN_KEY, '1')
    const code = new URLSearchParams(window.location.search).get('code')
    if (code && /^[A-Za-z0-9]{1,20}$/.test(code)) offerCode.set(code, 'link')
  } catch { /* storage unavailable */ }
}
