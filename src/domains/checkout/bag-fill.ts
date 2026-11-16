// =============================================================================
// HOW A BAG LINK FILLS THE BAG (one-address plan P0, decision 2). The bag remembers who last filled it: `link` (a bag
// link from a website) or `shop` (the shopper on the store's own Frrata pages). A link replaces a bag only links
// filled, or an empty one, or one sent from the store's own website; it joins a bag the shopper built here, so no
// outside site can empty it (security review L1, narrowed). A bag from before the marker existed is treated as the
// shopper's own.
// =============================================================================

export type BagBy = 'link' | 'shop'
export type FillMode = 'replace' | 'join'

export function fillMode({ by, empty, fromSite }: { by: BagBy | null; empty: boolean; fromSite: boolean }): FillMode {
  if (empty || fromSite) return 'replace'
  return by === 'link' ? 'replace' : 'join'
}

/** The marker as stored: anything else reads as unknown (null). */
export function readBagBy(raw: string | null): BagBy | null {
  return raw === 'link' || raw === 'shop' ? raw : null
}

/** Whether the referrer is the brand's own website (its host or its www twin; siteHostKey's rule). */
export function fromSite(referrer: string, site: string | null): boolean {
  if (!referrer || !site) return false
  try {
    const bare = (h: string) => h.toLowerCase().replace(/\.$/, '').replace(/^www\./, '')
    return bare(new URL(referrer).hostname) === bare(new URL(site).hostname)
  } catch { return false }
}
