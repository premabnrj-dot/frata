// =============================================================================
// FILE: src/domains/seo/tags.ts — EVERY SHOP PAGE'S SEARCH AND SHARING TAGS, BUILT ONCE (search and sharing S1·1).
// The one writer of a shop page's title, description, canonical, Open Graph, X card and product tags: every shop
// route's metadata maps this (src/app/s/[host]/_meta.ts), never builds tags by hand. Pure, no Next types
// (check:layers); words come in from the caller. Rules and sources: docs/research/2026-11-09-link-previews.md —
// og:url and canonical always clean, og:title without the shop's name, og:description about 80 characters
// (WhatsApp), twitter `summary_large_image`, `og:type product` with price tags (Pinterest, Meta).
// =============================================================================

import { shareCard } from './defaults'

export type PageKind = 'home' | 'product' | 'collection' | 'list' | 'policy'
/** A share image; `height` null for a photo whose height is not known (until the generated card, S1·3). */
export type ShareImage = { url: string; width: number; height: number | null; alt: string; type: 'image/jpeg' | 'image/webp' }
/** Google's product availability words, as Meta and Pinterest read them. */
export type ProductAvailability = 'in stock' | 'out of stock' | 'preorder'

export type PageFacts = {
  kind: PageKind
  /** The shop's host, e.g. kesar-studio.frrata.shop; the canonical is built from it and `path`, never from the request. */
  host: string
  /** Absolute path of the clean page: '/', '/products/kurta'. */
  path: string
  shopName: string
  /** The page title as the browser tab and Google read it (the shop's name already in it where wanted). */
  title: string
  /** og:title: the page's own name, never the shop's (WhatsApp: "no branding"). */
  shareTitle: string
  description: string | null
  lang: 'en' | 'hi'
  /** False: noindex (an unpublished shop, an unlisted product). */
  indexable: boolean
  image: ShareImage | null
  product?: { pricePaise: number; mrpPaise: number | null; availability: ProductAvailability; id: string; groupId: string }
}

export type PageTags = {
  title: string
  description: string | null
  canonical: string
  robots: { index: boolean; follow: boolean; maxImagePreview: 'large' | null }
  og: { type: 'website' | 'product'; url: string; title: string; description: string | null; siteName: string; locale: 'en_IN' | 'hi_IN'; image: ShareImage | null }
  twitter: { card: 'summary_large_image' | 'summary'; imageAlt: string | null }
  /** `product:*` (and Pinterest's `og:price:standard_amount`), as property= tags; empty off product pages. */
  product: [property: string, content: string][]
}

/** Paise to the decimal string the tags want: 249000 → "2490.00". */
export const amountOf = (paise: number) => (paise / 100).toFixed(2)

export function pageTags(f: PageFacts): PageTags {
  const url = `https://${f.host}${f.path}`
  const share = f.description ? shareCard(f.shareTitle, f.description).description : null
  const product: PageTags['product'] = f.product ? [
    ['product:price:amount', amountOf(f.product.pricePaise)],
    ['product:price:currency', 'INR'],
    ['product:availability', f.product.availability],
    ['product:condition', 'new'],
    ['product:brand', f.shopName],
    ['product:retailer_item_id', f.product.id],
    ['product:item_group_id', f.product.groupId],
    // Pinterest reads the M.R.P. here when the price is lower (product rich pins).
    ...(f.product.mrpPaise && f.product.mrpPaise > f.product.pricePaise ? [['og:price:standard_amount', amountOf(f.product.mrpPaise)] as [string, string]] : []),
  ] : []
  return {
    title: f.title,
    description: f.description,
    canonical: url,
    robots: { index: f.indexable, follow: f.indexable, maxImagePreview: f.indexable ? 'large' : null },
    og: { type: f.product ? 'product' : 'website', url, title: f.shareTitle, description: share, siteName: f.shopName, locale: f.lang === 'hi' ? 'hi_IN' : 'en_IN', image: f.image },
    twitter: { card: f.image ? 'summary_large_image' : 'summary', imageAlt: f.image?.alt ?? null },
    product,
  }
}
