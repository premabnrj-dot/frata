// =============================================================================
// FILE: src/domains/storefront-api/2026-12/filter.ts — D2: A LIST BY SIZE, COLOUR, PRICE AND STOCK (SA1b plan D·5;
// api-contract review 2026-11-16 M1–M4). Pure.
//
// `filter/page/{n}?collection=&size=&colour=&price=&stock=&sort=` and its menu `facets`. Over the same capped, listed
// set the pages read (CATALOGUE_CAP); every card is the pages' own cardOut. Two kinds of miss: a grammar error (an
// unknown or repeated parameter, one out of order, a default spelled out, a malformed value) is a 400 naming the
// parameter, after the key checks out; a well-formed size, colour or collection the store doesn't have now is an
// empty page (stock comes and goes: an hour-old menu link must not break a site). One URL per filter: parameters in
// one order and defaults left out, so the CDN keeps one copy per filter (speed review 8). `,` is reserved inside a
// value for choosing several later.
// =============================================================================

import { bestOffer } from '../../catalogue/availability'
import { factsOf, inCollection, isListed, pageOf, priceOf, sortProducts, type ListProduct } from '../../storefront/listing'
import { CATALOGUE_CAP, cardOut, plain, type CardIn, type CollectionIn, type MapCtx } from './map'
import type { z } from 'zod'
import type * as S from './schemas'

export const FILTER_PARAMS = ['collection', 'size', 'colour', 'price', 'stock', 'sort'] as const
export type FilterParam = (typeof FILTER_PARAMS)[number]
export const FILTER_SORTS = ['featured', 'new', 'price_asc', 'price_desc'] as const
export type FilterSort = (typeof FILTER_SORTS)[number]
/** Price bands in paise, half-open [min, max): over a product's lowest price, before any offer. Ids may grow. */
export const PRICE_BANDS = [
  { id: 'p1', min: 0, max: 100_000 }, { id: 'p2', min: 100_000, max: 200_000 }, { id: 'p3', min: 200_000, max: 500_000 }, { id: 'p4', min: 500_000, max: null },
] as const
export type FilterQuery = { collection: string | null; size: string | null; colour: string | null; price: string | null; stock: boolean; sort: FilterSort }

/** A value as a filter sends it: lower case, ASCII letters and digits joined by dashes ("Free size" → free-size). */
export const facetValue = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, 40).replace(/-+$/, '')
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** The query, or the parameter that broke the grammar. */
export function parseFilter(search: URLSearchParams | null): FilterQuery | { bad: string } {
  const q: FilterQuery = { collection: null, size: null, colour: null, price: null, stock: false, sort: 'featured' }
  let last = -1
  for (const [k, v] of search ?? new URLSearchParams()) {
    const at = (FILTER_PARAMS as readonly string[]).indexOf(k)
    if (at < 0) return { bad: k.slice(0, 40) || 'query' }
    if (at <= last) return { bad: k }
    last = at
    const p = k as FilterParam
    if (p === 'sort') { if (!(FILTER_SORTS as readonly string[]).includes(v) || v === 'featured') return { bad: p }; q.sort = v as FilterSort; continue }
    if (p === 'stock') { if (v !== 'in') return { bad: p }; q.stock = true; continue }
    if (p === 'price') { if (!PRICE_BANDS.some((b) => b.id === v)) return { bad: p }; q.price = v; continue }
    if (!SLUG.test(v) || v.length > (p === 'collection' ? 100 : 40)) return { bad: p }
    q[p] = v
  }
  return q
}

/** Which option a product calls Size (the merchant names options; "Size" in any case). */
const sizeAt = (p: CardIn) => p.options.findIndex((o) => o.trim().toLowerCase() === 'size')
const coloursOf = (p: CardIn): string[] => [...new Set(p.colours.flatMap((c) => (c.family ? [facetValue(c.family)] : [])).filter(Boolean))]
const inStockNow = (vs: CardIn['variants'], now: Date) => { const a = bestOffer(vs.map(factsOf), now); return a?.kind === 'in_stock' || a?.kind === 'low_stock' }
const band = (p: CardIn) => { const min = priceOf(p)?.min; return min === undefined ? null : PRICE_BANDS.find((b) => min >= b.min && (b.max === null || min < b.max))?.id ?? null }

/** The set a filter reads: the store's listed products (capped), or a collection's members in the collection's own
 *  order, exactly as collections/{h}/page/{n} reads them (moved handles followed). Null: no such collection now. */
function base<P extends CardIn>(all: P[], collections: CollectionIn[], moved: Record<string, string> | undefined, handle: string | null, now: Date): P[] | null {
  const listed = all.filter((p) => isListed(p, now))
  if (!handle) return listed.slice(0, CATALOGUE_CAP)
  const c = collections.find((x) => x.handle === handle) ?? collections.find((x) => x.handle === moved?.[handle])
  return c ? (sortProducts(inCollection(c, listed as unknown as ListProduct[], now), c.sort, c.productIds) as unknown as P[]) : null
}

export function filterPageOut<P extends CardIn>(m: MapCtx, cat: { products: P[]; collections: CollectionIn[]; movedCollections?: Record<string, string> }, q: FilterQuery, page: number, now: Date): z.input<typeof S.FilterPage> | null {
  const listedAll = cat.products.filter((p) => isListed(p, now))
  const truncated = listedAll.length > CATALOGUE_CAP
  const from = base(cat.products, cat.collections, cat.movedCollections, q.collection, now) ?? []
  const hit = from.filter((p) => {
    const i = sizeAt(p)
    const vs = q.size ? p.variants.filter((v) => i >= 0 && facetValue(v.values[i] ?? '') === q.size) : p.variants
    if (q.size && !vs.length) return false
    if (q.colour && !coloursOf(p).includes(q.colour)) return false
    if (q.price && band(p) !== q.price) return false
    if (q.stock && !inStockNow(vs, now)) return false
    return true
  })
  const min = (p: P) => priceOf(p)?.min ?? Number.MAX_SAFE_INTEGER
  const sorted = q.sort === 'new' ? sortProducts(hit as unknown as ListProduct[], 'newest') as unknown as P[]
    : q.sort === 'price_asc' ? [...hit].sort((a, b) => min(a) - min(b)) : q.sort === 'price_desc' ? [...hit].sort((a, b) => min(b) - min(a)) : hit
  const { items, pages } = pageOf(sorted, page)
  if (page > pages) return null
  return { products: items.map((p) => cardOut(m, p, now)), page, pages, total: sorted.length, truncated }
}

/** The store's filter menu: each value with the exact `value` to send and how many listed products have it. */
export function facetsOut<P extends CardIn>(all: P[], now: Date): z.input<typeof S.Facets> {
  const listed = all.filter((p) => isListed(p, now)).slice(0, CATALOGUE_CAP)
  const count = (label: Map<string, { label: string; count: number }>, value: string, l: string) => { const e = label.get(value); if (e) e.count += 1; else label.set(value, { label: plain(l, 60), count: 1 }) }
  const sizes = new Map<string, { label: string; count: number }>(), colours = new Map<string, { label: string; count: number }>()
  for (const p of listed) {
    const i = sizeAt(p)
    if (i >= 0) for (const v of [...new Map(p.variants.map((x) => [facetValue(x.values[i] ?? ''), (x.values[i] ?? '').trim()])).entries()]) if (v[0]) count(sizes, v[0], v[1])
    for (const c of new Map(p.colours.flatMap((x) => (x.family ? [[facetValue(x.family), x.family.trim()] as const] : []))).entries()) if (c[0]) count(colours, c[0], c[1])
  }
  const list = (m: Map<string, { label: string; count: number }>) => [...m.entries()].map(([value, e]) => ({ value, label: e.label, count: e.count })).slice(0, 100)
  return {
    sizes: list(sizes), colours: list(colours).sort((a, b) => b.count - a.count),
    prices: PRICE_BANDS.map((b) => ({ id: b.id, min: b.min, max: b.max, count: listed.filter((p) => band(p) === b.id).length })),
    inStock: listed.filter((p) => inStockNow(p.variants, now)).length,
  }
}

