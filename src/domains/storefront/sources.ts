import { inCollection, isListed, priceOf, type ListCollection, type ListProduct } from './listing'

// =============================================================================
// FILE: src/domains/storefront/sources.ts — which products a theme section shows (the "shortcodes").
// Pure, resolved on the server inside the cached shop read; `now` passed in. Listed products only.
// NEVER a ranking by cost, margin or profit: the order of a list reaches the shopper, so it would leak cost
// order (ADR-0003). Best sellers (T1) ranks by delivered units from a server-side read that returns ids only.
// =============================================================================

export type Source =
  | { kind: 'newest' }
  | { kind: 'collection'; handle: string }
  | { kind: 'under_price'; maxPaise: number }
  | { kind: 'on_sale' }

type Cat<P extends ListProduct> = { products: P[]; collections: (ListCollection & { handle: string })[] }

/** Every product the source matches, in its order. The section takes the first `count`. */
export function sourceProducts<P extends ListProduct>(src: Source, cat: Cat<P>, now: Date): P[] {
  const listed = () => cat.products.filter((p) => isListed(p, now))
  switch (src.kind) {
    // Newest first by `since` (publish_at, else published_at, else created_at): the catalogue read's own order.
    case 'newest': return listed().sort((a, b) => b.since.localeCompare(a.since))
    case 'collection': {
      const c = cat.collections.find((x) => x.handle === src.handle)
      return c ? inCollection(c, cat.products, now) : []
    }
    case 'under_price': return listed().filter((p) => { const pr = priceOf(p); return !!pr && pr.min <= src.maxPaise })
    case 'on_sale': return listed().filter((p) => p.variants.some((v) => v.compareAt !== null && v.compareAt > v.price))
  }
}
