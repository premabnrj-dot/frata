// =============================================================================
// FILE: src/domains/storefront-api/2026-12/structured.ts
//
// G·4 (Studio plan § G-a; the contract review folded in, M10): the store's structured data on the API, and a product's
// home collection. The JSON-LD is the store pages' own (src/domains/seo/defaults.ts: shopJsonLd, productJsonLd,
// breadcrumbJsonLd, itemListJsonLd), never a second copy of its rules; only its addresses differ, on the website's
// origin (websiteOrigin, ruling C6). Serialised with every `<` escaped, as the store's own <JsonLd> does, so a site puts
// it inside <script type="application/ld+json"> as it is. Photos only from the store's own media folder (imageOut's
// rule). Pure.
// =============================================================================

import { breadcrumbJsonLd, itemListJsonLd, productJsonLd, shopJsonLd } from '../../seo/defaults'
import { productLdInput } from '../../seo/product-ld'
import { pick, urlFor } from '../../media/sizes'
import { instagramLink } from '../../settings/instagram'
import { inCollection, type ListProduct } from '../../storefront/listing'
import type { PublicZone } from '../../delivery/public'
import { imageOut, type CardIn, type CollectionIn, type MapCtx, type ProductIn } from './map'

/** JSON text for a <script type="application/ld+json">: no `</script>` can close it early. */
export const ldText = (data: object): string => JSON.stringify(data).replace(/</g, '\\u003c')

/** What the structured data needs of the store (a named pick of the shop entry: nothing else reaches it). */
export type LdShop = {
  shopName: string; logo: string | null; instagram: string; codOn: boolean; returnDays: number; returnKind: string
  shippingFlat: number; freeShippingAbove: number; metroDays: number; restDays: number; dispatchDays: number; zones: PublicZone[] | null
}

/** The product page's photo width (1200), and only from the store's own folder (imageOut's rule). */
const photo = (m: MapCtx) => (i: { base: string; widths: number[] }) => (imageOut(m, { ...i, alt: '' }) ? urlFor(i.base, pick(i.widths, 1200)) : null)

export function shopLd(s: LdShop, origin: string): string {
  const ig = instagramLink(s.instagram)
  return ldText(shopJsonLd({ name: s.shopName, url: origin, logo: s.logo, sameAs: ig ? [ig] : [], returnDays: s.returnDays,
    returnKind: s.returnKind, shippingFlat: s.shippingFlat, freeShippingAbove: s.freeShippingAbove, metroDays: s.metroDays, restDays: s.restDays,
    dispatchDays: s.dispatchDays, zones: s.zones }))
}

/** A product as the store's own product page describes it (one input rule: src/domains/seo/product-ld.ts), its rating
 *  aside (reviews are not on the API), on the website's origin. */
export function productLd(m: MapCtx, p: ProductIn, s: LdShop, origin: string, now: Date): string {
  return ldText(productJsonLd(productLdInput(p, s, { url: `${origin}/products/${p.handle}`, photo: photo(m), now })))
}

/** A collection page: the breadcrumb and its first 24 listed products, as the store's collection page gives them. */
export function collectionLd<P extends CardIn>(c: CollectionIn, all: P[], shopName: string, origin: string, now: Date): string {
  const members = inCollection(c, all as unknown as ListProduct[], now) as unknown as P[]
  return ldText([
    breadcrumbJsonLd([{ name: shopName, url: `${origin}/` }, { name: c.title, url: `${origin}/collections/${c.handle}` }]),
    itemListJsonLd(members.slice(0, 24).map((p) => `${origin}/products/${p.handle}`)),
  ])
}

/** G6: a product's home collection, the first of the store's collections (in the store's order) that holds it. */
export function homeCollection<C extends CollectionIn>(p: CardIn, collections: C[], now: Date): { handle: string; title: string } | null {
  const one = [p] as unknown as ListProduct[]
  const c = collections.find((x) => inCollection(x, one, now).length > 0)
  return c ? { handle: c.handle, title: c.title.slice(0, 200) } : null
}
