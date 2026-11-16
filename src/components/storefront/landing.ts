'use client'

/** Where the shopper is, read at once: the attribution capture's chunk may arrive after a tap has already moved the page
 *  (a tile's client navigation), so the shell reads this in its effect and hands it to captureAttribution. */
export type Landing = { href: string; search: string; pathname: string; hostname: string; referrer: string }
export const landingNow = (): Landing => {
  const l = window.location
  return { href: l.href, search: l.search, pathname: l.pathname, hostname: l.hostname, referrer: document.referrer }
}
