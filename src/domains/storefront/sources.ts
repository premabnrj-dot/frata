import { inCollection, isListed, priceOf, type ListCollection, type ListProduct } from './listing'

// =============================================================================
// FILE: src/domains/storefront/sources.ts — which products a theme section shows (the "shortcodes").
// Pure, resolved on the server inside the cached shop read; `now` passed in. Listed products only.
// NEVER a ranking by cost, margin or profit: the order of a list reaches the shopper, so it would leak cost
// order (ADR-0003). Best sellers (T1) ranks by delivered units from a server-side read that returns ids only.
// =============================================================================

export type Source =
  | { kind: 'newest' }
  | { kind: 'best_sellers'; days: 30 | 90 }
  | { kind: 'collection'; handle: string }
  | { kind: 'under_price'; maxPaise: number }
  | { kind: 'on_sale' }
  | { kind: 'back_in_stock' }

/** Back in stock looks back this far (one constant: the source and anything that names it). */
export const RESTOCK_DAYS = 30

type Cat<P extends ListProduct> = { products: P[]; collections: (ListCollection & { handle: string })[] }

/** Every product the source matches, in its order. The section takes the first `count`. */
/** `ranked`: for Best sellers, product ids by delivered units in the window (bestSellerOrder; ids only, never counts). */
export function sourceProducts<P extends ListProduct>(src: Source, cat: Cat<P>, now: Date, ranked: string[] = []): P[] {
  const listed = () => cat.products.filter((p) => isListed(p, now))
  switch (src.kind) {
    // Newest first by `since` (publish_at, else published_at, else created_at): the catalogue read's own order.
    case 'newest': return listed().sort((a, b) => b.since.localeCompare(a.since))
    case 'best_sellers': {
      const at = new Map(ranked.map((id, i) => [id, i]))
      return listed().filter((p) => at.has(p.id)).sort((a, b) => at.get(a.id)! - at.get(b.id)!)
    }
    case 'collection': {
      const c = cat.collections.find((x) => x.handle === src.handle)
      return c ? inCollection(c, cat.products, now) : []
    }
    case 'under_price': return listed().filter((p) => { const pr = priceOf(p); return !!pr && pr.min <= src.maxPaise })
    case 'on_sale': return listed().filter((p) => p.variants.some((v) => v.compareAt !== null && v.compareAt > v.price))
    // A variant that sold out for a day or more (the database decides: restocked_at) came back in the window and a
    // shopper can buy it now (stock after pre-orders still owed). Latest first. One size back puts the product here.
    case 'back_in_stock': {
      const since = now.getTime() - RESTOCK_DAYS * 86_400_000
      const back = (p: P) => Math.max(0, ...p.variants.filter((v) => v.restockedAt && v.stock > 0 && Date.parse(v.restockedAt) >= since).map((v) => Date.parse(v.restockedAt!)))
      return listed().map((p) => [p, back(p)] as const).filter(([, t]) => t > 0).sort((a, b) => b[1] - a[1]).map(([p]) => p)
    }
  }
}

/** Shop the look's pieces as a shopper sees them: in the order pinned, only products listed now (a hidden or unlisted
 *  piece drops out; with none left the section shows nothing). Handles name the shop's own catalogue only. */
export function lookPieces<P extends ListProduct & { handle: string }, X extends { handle: string }>(pins: X[], products: P[], now: Date): (X & { p: P })[] {
  return pins.flatMap((x) => { const p = products.find((q) => q.handle === x.handle && isListed(q, now)); return p ? [{ ...x, p }] : [] })
}
