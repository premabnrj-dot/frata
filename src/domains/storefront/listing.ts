// =============================================================================
// FILE: src/domains/storefront/listing.ts
//
// WHAT A SHOP'S LISTS SHOW, decided at render from raw rows (the cache never
// holds a decision that depends on the clock): which products are listed now,
// which belong to a collection (hand-picked, or by its rules), their order,
// price range and the one tag a card may carry. Pure; `now` is passed in.
// =============================================================================

import { availability, visibility, type Status, type VariantFacts, type WhenOut } from '@/domains/catalogue/availability'
import { cleanRules, matches, type ProductFacts } from '@/domains/catalogue/collection-rules'

export type ListVariant = { values: string[]; price: number
  /** The 30-day prior price when cut within 30 days (derived by the loader); the tag's M.R.P. is `mrp`. */
  compareAt: number | null; mrp?: number | null; stock: number; whenOut: WhenOut; shipsBy: string | null; leadMinDays: number | null; leadMaxDays: number | null; preorderFull: boolean
  /** When it came back after selling out (kept by the database; themes T2 Back in stock). Absent: unknown. */
  restockedAt?: string | null }
export type ListProduct = {
  id: string; title: string; status: string; publishAt: string | null; since: string
  categoryId: string | null; attributes: Record<string, string[]>; tags: string[]
  colours: { value: string; family: string | null }[]; variants: ListVariant[]
  /** Offers the shop shows on this product (raw: live is decided at render; offer-showcase.ts). */
  offers?: import('@/domains/checkout/offer-showcase').ShowOffer[]
}
export type ListCollection = { kind: 'manual' | 'auto'; matchAll: boolean; rules: unknown[]; sort: string; productIds: string[] }

/** A variant's facts as availability() reads them (a full pre-order list reads as a cap already reached). */
export const factsOf = (v: ListVariant): VariantFacts => ({ stock: v.stock, whenOut: v.whenOut, shipsBy: v.shipsBy, leadMinDays: v.leadMinDays, leadMaxDays: v.leadMaxDays, preorderCap: v.preorderFull ? 0 : null })

export const isListed = (p: Pick<ListProduct, 'status' | 'publishAt'>, now: Date) => visibility(p.status as Status, p.publishAt ? new Date(p.publishAt) : null, now).listed

/** The lowest price, and what it is compared at (only if every variant at that price shows one). */
export function priceOf(p: Pick<ListProduct, 'variants'>): { min: number; max: number; compareAt: number | null } | null {
  const priced = p.variants.filter((v) => v.price > 0)
  if (!priced.length) return null
  const min = Math.min(...priced.map((v) => v.price)), max = Math.max(...priced.map((v) => v.price))
  const at = priced.filter((v) => v.price === min).map((v) => v.compareAt)
  const compareAt = at.every((c) => c !== null && c > min) && new Set(at).size === 1 ? at[0]! : null
  return { min, max, compareAt }
}

export function canBuy(p: Pick<ListProduct, 'variants'>, now: Date) {
  return p.variants.some((v) => availability(factsOf(v), now).canBuy)
}

/** The one tag a card may show: Sold out, or how it sells when nothing is in stock. */
export function cardTag(p: Pick<ListProduct, 'variants'>, now: Date): 'Sold out' | 'Pre-order' | 'Made to order' | null {
  const a = p.variants.map((v) => availability(factsOf(v), now))
  if (!a.length || a.some((x) => x.kind === 'in_stock' || x.kind === 'low_stock')) return null
  if (a.some((x) => x.kind === 'preorder')) return 'Pre-order'
  if (a.some((x) => x.kind === 'made_to_order')) return 'Made to order'
  return 'Sold out'
}

export function ruleFacts(p: ListProduct, now: Date): ProductFacts {
  const price = priceOf(p)
  return { categoryId: p.categoryId, attributes: p.attributes, colourFamilies: p.colours.map((c) => c.family).filter((x): x is string => !!x), minPrice: price?.min ?? null, inStock: canBuy(p, now), tags: p.tags }
}

export function sortProducts<T extends ListProduct>(list: T[], sort: string, manual: string[] = []): T[] {
  const by = [...list]
  const price = (p: T) => priceOf(p)?.min ?? Number.MAX_SAFE_INTEGER
  if (sort === 'manual') return by.sort((a, b) => manual.indexOf(a.id) - manual.indexOf(b.id))
  if (sort === 'price_low') return by.sort((a, b) => price(a) - price(b))
  if (sort === 'price_high') return by.sort((a, b) => price(b) - price(a))
  if (sort === 'title') return by.sort((a, b) => a.title.localeCompare(b.title))
  return by.sort((a, b) => b.since.localeCompare(a.since))
}

/** A collection's products right now: listed ones only, picked or matching its rules, in its order. */
export function inCollection<T extends ListProduct>(c: ListCollection, all: T[], now: Date): T[] {
  const live = all.filter((p) => isListed(p, now))
  const members = c.kind === 'manual' ? live.filter((p) => c.productIds.includes(p.id)) : live.filter((p) => matches(cleanRules(c.rules), c.matchAll, ruleFacts(p, now)))
  return sortProducts(members, c.sort, c.productIds)
}
