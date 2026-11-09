/**
 * Search and sharing S·3: the shop's fixes, each a count and a link straight to the first thing to fix. A fix with a
 * zero count is not listed (it disappears when done). No score (Rule 0). The barcode fix waits for Google Shopping
 * (S·4): before a feed reads it, it would ask every brand without barcodes for something nothing uses.
 */
export type FixFacts = {
  photosNoAlt: { count: number; firstHandle: string | null }
  collectionsNoIntro: { count: number; firstHandle: string | null }
  sameTitle: { count: number; firstHandle: string | null }
}
export type Fix = { key: string; text: string; action: string; href: string }

const n = (c: number, one: string, many: string) => `${c} ${c === 1 ? one : many}`

export function seoFixes(f: FixFacts): Fix[] {
  const out: Fix[] = []
  if (f.photosNoAlt.count && f.photosNoAlt.firstHandle) out.push({ key: 'alt', text: `${n(f.photosNoAlt.count, 'photo', 'photos')} without a description`, action: 'Describe', href: `/console/products/${f.photosNoAlt.firstHandle}#photos` })
  if (f.collectionsNoIntro.count && f.collectionsNoIntro.firstHandle) out.push({ key: 'intro', text: `${n(f.collectionsNoIntro.count, 'collection', 'collections')} without an intro`, action: 'Add intro', href: `/console/collections/${f.collectionsNoIntro.firstHandle}` })
  if (f.sameTitle.count && f.sameTitle.firstHandle) out.push({ key: 'title', text: `${n(f.sameTitle.count, 'product', 'products')} with the same title`, action: 'Review', href: `/console/products/${f.sameTitle.firstHandle}` })
  return out
}
