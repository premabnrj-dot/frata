import 'server-only'
import { createHash } from 'node:crypto'
import { pick, urlFor } from '@/domains/media/sizes'
import { offerOf } from '@/domains/seo/tags'
import { factsOf, inCollection, isListed, priceOf } from '@/domains/storefront/listing'
import { availability } from '@/domains/catalogue/availability'
import type { ResolvedTheme } from '@/domains/themes/types'
import { formatInr } from '@/lib/format'
import { paise } from '@/domains/money/paise'
import type { StoreCard, StoreCatalogue, StoreCollection, StoreProduct, StoreShop } from '@/lib/queries/storefront'

// =============================================================================
// FILE: src/lib/seo/card.ts — WHAT A SHARE CARD SHOWS, AND ITS VERSION (search and sharing S1·2).
// The card reads the same view model as the page (price as the buy box: the lowest price a shopper can buy at, the
// M.R.P. beside it, never struck as a sale), and its hash covers everything drawn plus the template version, so an
// edit makes a new image URL and every app fetches the new card. Only prices, names and photo addresses — never a
// cost (ADR-0003). No Devanagari is drawn (Satori cannot shape it): a Hindi name is left to og:title.
// =============================================================================

/** Bump when a layout changes: every card gets a new URL. */
export const TEMPLATE_VERSION = 1
export const CARD = { width: 1200, height: 630 } as const
export type CardKind = 'product' | 'collection' | 'shop'

export type CardContent = {
  kind: CardKind
  /** The page's name (product, collection); null on the shop card. */
  title: string | null
  shopName: string | null
  /** "₹2,490"; null when there is nothing to buy at a price. */
  price: string | null
  /** The M.R.P. beside the price, when above it. */
  mrp: string | null
  soldOut: boolean
  cod: boolean
  /** "From ₹1,290 · 24 styles" on a collection; "Pay on delivery · 7-day returns" on the shop card. */
  line: string | null
  /** Photo addresses (our own store, the 1200 rung), at most four. */
  photos: string[]
  colours: { bg: string; text: string; sub: string }
}

const DEVANAGARI = /[ऀ-ॿ]/
/** Text Satori can draw: nothing with Devanagari. */
const drawable = (s: string | null) => (s && !DEVANAGARI.test(s) ? s : null)
const inr = (p: number) => formatInr(paise(p))
const photo = (img: { base: string; widths: number[] } | undefined) => (img ? urlFor(img.base, pick(img.widths, 1200)) : null)
const coloursOf = (theme: ResolvedTheme) => ({ bg: theme.schemes.tint.bg, text: theme.schemes.tint.text, sub: theme.schemes.tint.sub })

export function productCard(shop: StoreShop, p: StoreProduct, theme: ResolvedTheme, now: Date): CardContent {
  const o = offerOf(p.variants.map((v) => { const a = availability(factsOf(v), now); return { price: v.price, compareAt: v.compareAt, google: a.google, canBuy: a.canBuy } }))
  return {
    kind: 'product', title: drawable(p.title), shopName: drawable(shop.shopName),
    price: o ? inr(o.pricePaise) : null, mrp: o?.mrpPaise ? inr(o.mrpPaise) : null, soldOut: !o || o.availability === 'out of stock',
    cod: shop.codOn, line: null, photos: [photo(p.images[0])].filter((x): x is string => !!x), colours: coloursOf(theme),
  }
}

export function collectionCard(shop: StoreShop, c: StoreCollection, cat: StoreCatalogue, theme: ResolvedTheme, now: Date): CardContent {
  const items = inCollection(c, cat.products, now)
  const prices = items.map((p) => priceOf(p)?.min ?? 0).filter((x) => x > 0)
  const line = items.length ? `${prices.length ? `From ${inr(Math.min(...prices))} · ` : ''}${items.length} ${items.length === 1 ? 'style' : 'styles'}` : null
  return {
    kind: 'collection', title: drawable(c.title), shopName: drawable(shop.shopName), price: null, mrp: null, soldOut: false, cod: shop.codOn,
    line, photos: items.slice(0, 4).map((p) => photo(p.images[0])).filter((x): x is string => !!x), colours: coloursOf(theme),
  }
}

export function shopCard(shop: StoreShop, best: StoreCard[], theme: ResolvedTheme, now: Date): CardContent {
  const listed = best.filter((p) => isListed(p, now))
  const bits = [shop.codOn ? 'Pay on delivery' : null, shop.returnKind !== 'none' && shop.returnDays > 0 ? `${shop.returnDays}-day returns` : null].filter(Boolean)
  return {
    kind: 'shop', title: null, shopName: drawable(shop.shopName), price: null, mrp: null, soldOut: false, cod: shop.codOn,
    line: bits.length ? bits.join(' · ') : null, photos: listed.slice(0, 3).map((p) => photo(p.images[0])).filter((x): x is string => !!x), colours: coloursOf(theme),
  }
}

/** The card's version: 16 hex characters over what is drawn and the template. */
export function cardHash(c: CardContent): string {
  return createHash('sha256').update(JSON.stringify([TEMPLATE_VERSION, c])).digest('hex').slice(0, 16)
}

/** The card's address on the shop's own host (S1·3: the only shape the route draws). */
export function cardPath(c: CardContent, id: string | null): string {
  const h = cardHash(c)
  return c.kind === 'shop' ? `/og/shop/${h}.jpg` : `/og/${c.kind}/${id}/${h}.jpg`
}

/** Everything a card needs, read through the shop's cached loaders (the tenant is the host's: the caller's shop). */
export type CardSource =
  | { kind: 'product'; product: StoreProduct }
  | { kind: 'collection'; collection: StoreCollection; cat: StoreCatalogue }
  | { kind: 'shop'; cat: StoreCatalogue }

export function cardOf(shop: StoreShop, src: CardSource, theme: ResolvedTheme, now: Date): CardContent {
  if (src.kind === 'product') return productCard(shop, src.product, theme, now)
  if (src.kind === 'collection') return collectionCard(shop, src.collection, src.cat, theme, now)
  return shopCard(shop, src.cat.products, theme, now)
}
