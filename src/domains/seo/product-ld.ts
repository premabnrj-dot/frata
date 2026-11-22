// =============================================================================
// FILE: src/domains/seo/product-ld.ts
//
// A PRODUCT'S STRUCTURED-DATA INPUT, ONCE (G·4; impact review 2026-11-22: the product page and the Storefront API built
// it apart and had already drifted). Read by the store's product page (src/components/storefront/product-view.tsx)
// and by the API's `product.jsonLd` (src/domains/storefront-api/2026-12/structured.ts). Each passes its own address and
// its own photo rule (the API keeps only photos from the store's own folder); everything else is this one rule. Pure.
// =============================================================================

import { availability } from '../catalogue/availability'
import { describeAttribute } from '../catalogue/taxonomy'
import { detailsOf } from '../catalogue/details'
import { labelRows, readLabel } from '../catalogue/label'
import { colourIndex } from '../catalogue/option-kind'
import { factsOf, priceOf, type ListVariant } from '../storefront/listing'
import { defaultDescription, type LdProduct, type LdRating } from './defaults'

type Photo = { base: string; widths: number[]; optionValue?: string | null }
export type LdProductIn = {
  id: string; title: string; options: string[]; attributes: Record<string, string[]>; seoDescription?: string
  label?: Record<string, unknown> | null; originCountry?: string | null
  images: Photo[]; variants: (ListVariant & { sku?: string | null; gtin?: string | null; values: string[]; price: number; compareAt: number | null })[]
}
export type LdShopIn = { shopName: string; codOn: boolean; returnDays: number; returnKind: string }

/** The product's description for search: its own, else the default from its facts (productSeo's rule). */
export function productDescription(p: LdProductIn, shop: LdShopIn): string {
  const fabric = detailsOf(p).find((d) => d.name === 'Fabric')?.value ?? null
  return p.seoDescription || defaultDescription({ title: p.title, fabric, minPrice: priceOf(p)?.min ?? null, codOn: shop.codOn, returnDays: shop.returnDays, returnKind: shop.returnKind, city: null })
}

/** productJsonLd's input. `photo` turns a stored photo into its URL (or null to leave it out). */
export function productLdInput(p: LdProductIn, shop: LdShopIn, at: { url: string; photo: (i: Photo) => string | null; now: Date; rating?: LdRating | null }): LdProduct {
  const details = [...detailsOf(p), ...labelRows(readLabel(p.label ?? {}), p.originCountry ?? null)]
  const g = p.attributes['target-gender']?.[0]
  const ci = colourIndex(p.options)
  return {
    rating: at.rating,
    name: p.title, description: productDescription(p, shop), url: at.url, groupId: p.id, brand: shop.shopName, options: p.options,
    material: details.find((d) => d.name === 'Fabric')?.value ?? null,
    gender: g ? describeAttribute('target-gender')?.values.find((v) => v.id === g)?.name ?? null : null,
    images: p.images.slice(0, 6).map(at.photo).filter((u): u is string => !!u),
    variants: p.variants.filter((v) => v.price > 0).map((v) => {
      const img = ci >= 0 ? p.images.find((i) => i.optionValue === v.values[ci]) : undefined
      return { sku: v.sku ?? null, gtin: v.gtin ?? null, values: v.values, price: v.price, availability: availability(factsOf(v), at.now), image: img ? at.photo(img) : null }
    }),
  }
}
