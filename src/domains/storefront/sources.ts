import { compareBy, inCollection, isListed, priceOf, ruleFacts, type ListCollection, type ListProduct } from './listing'
import { cleanRules, matches } from '../catalogue/collection-rules'

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

/** A collection's cover: its first listed piece (the tiles' rule, shared with the Storefront API's `image`, G·4). */
export const collectionCover = <P extends ListProduct>(c: ListCollection, products: P[], now: Date): P | null => inCollection(c, products, now)[0] ?? null

/**
 * Every collection's cover at once, as collectionCover gives each (speed review 2026-11-22: 500 collections × 600 products
 * filtered and sorted one by one took 146–221 ms). Listed products and their rule facts are worked out once; each
 * collection then takes its first member by its own order in one pass (sortProducts' order, ties kept as listed).
 */
export function collectionCovers<P extends ListProduct, C extends ListCollection>(collections: readonly C[], products: P[], now: Date): Map<C, P | null> {
  const live = products.filter((p) => isListed(p, now))
  const facts = new Map(live.map((p) => [p, ruleFacts(p, now)]))
  const out = new Map<C, P | null>()
  for (const c of collections) {
    const rules = c.kind === 'manual' ? null : cleanRules(c.rules)
    const cmp = compareBy<P>(c.sort, c.productIds) // sortProducts' own order
    let first: P | null = null
    for (const p of live) {
      if (rules ? !matches(rules, c.matchAll, facts.get(p)!) : !c.productIds.includes(p.id)) continue
      if (!first || cmp(p, first) < 0) first = p
    }
    out.set(c, first)
  }
  return out
}

/** Collection tiles (the section and a design's block: one rule; TS1b architecture 8): the picked collections in the
 *  order picked, or (handles null) the shop's own in their order; only those with a listed piece, each with its first;
 *  stops at `count` (speed LOW 6). */
export function tilesOf<P extends ListProduct, C extends ListCollection & { handle: string }>(cat: { products: P[]; collections: C[] }, now: Date, handles: readonly string[] | null, count: number): { c: C; first: P }[] {
  const pool = handles ? handles.flatMap((h) => cat.collections.filter((c) => c.handle === h)) : cat.collections
  const out: { c: C; first: P }[] = []
  for (const c of pool) {
    if (out.length >= count) break
    const first = collectionCover(c, cat.products, now)
    if (first) out.push({ c, first })
  }
  return out
}
