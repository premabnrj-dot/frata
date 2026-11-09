// =============================================================================
// FILE: src/domains/seo/defaults.ts
//
// SEARCH AND SHARING, MADE FOR EVERY PRODUCT (owner-approved 2026-11-06).
// The merchant may override title and description; empty means these
// defaults. Sources (Google Search Central, each page's own date): title links
// 2025-12-10, snippets 2026-04-20, product variants and merchant listings
// 2026-09-08, URL structure 2026-10-21; WhatsApp link previews 2026-05-21.
// Pure: money in paise, rendered to rupees only here at the edge.
// =============================================================================

import type { Availability } from '../catalogue/availability'

/** Google shows no fixed length; these are when to warn that a phone may shorten it. */
export const TITLE_WARN_AT = 60
export const DESCRIPTION_WARN_AT = 155
/** WhatsApp shows about this much of a preview's description. */
export const SHARE_DESCRIPTION_MAX = 80

const rupees = (p: number) => (p / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })

/** "Chanderi Anarkali Kurta – Maroon | Kesar Studio": the colour only when there is one; the shop's name once, at the end. */
export function defaultTitle(title: string, colours: readonly string[], shop: string): string {
  return `${title}${colours.length === 1 ? ` – ${colours[0]}` : ''} | ${shop}`
}

export type DescriptionFacts = { title: string; fabric: string | null; minPrice: number | null; codOn: boolean; returnDays: number; returnKind: string; city: string | null }

/** One natural sentence from the product's own facts, so every product's differs (Google: generated is fine if it reads naturally). */
export function defaultDescription(f: DescriptionFacts): string {
  const parts = [`${f.title}${f.fabric ? ` in ${f.fabric.toLowerCase()}` : ''}.`]
  const buy: string[] = []
  if (f.minPrice) buy.push(`From ₹${rupees(f.minPrice)}`)
  if (f.codOn) buy.push('Pay on delivery')
  if (f.returnKind !== 'none' && f.returnDays > 0) buy.push(`${f.returnDays}-day ${f.returnKind === 'refund_only' ? 'returns' : 'exchange'}`)
  if (buy.length) parts.push(buy.join(', ') + '.')
  if (f.city) parts.push(`Ships from ${f.city}.`)
  return parts.join(' ')
}

/** What a share card shows: the title without the shop's name, and a description cut at a word. */
export function shareCard(title: string, description: string) {
  const d = description.length <= SHARE_DESCRIPTION_MAX ? description : description.slice(0, SHARE_DESCRIPTION_MAX - 1).replace(/\s+\S*$/, '') + '…'
  return { title, description: d }
}

/** A product's address after a handle change: the old one is kept (and redirects) only if the product has ever been live. */
export function handleChange(oldHandle: string, newHandle: string, everPublished: boolean): { changed: boolean; keepOld: boolean } {
  const changed = oldHandle !== newHandle
  return { changed, keepOld: changed && everPublished }
}

export type LdVariant = { sku: string | null; gtin?: string | null; values: string[]; price: number; availability: Availability; image: string | null }
export type LdProduct = { name: string; description: string; url: string; groupId: string; brand: string; options: string[]; variants: LdVariant[]; images: string[]; material: string | null; gender: string | null }

const SCHEMA_AVAIL: Record<Availability['google'], string> = { in_stock: 'https://schema.org/InStock', out_of_stock: 'https://schema.org/OutOfStock', preorder: 'https://schema.org/PreOrder' }

/**
 * Structured data: a ProductGroup when there are variants (Google's single-page
 * variant pattern: each variant has a ?colour=&size= URL, all share one
 * canonical), otherwise a Product. Shipping and returns are published once for
 * the shop (Organization), not repeated here. No reviews until real ones exist.
 */
export function productJsonLd(p: LdProduct): object {
  const offer = (v: LdVariant) => ({
    '@type': 'Offer', url: variantUrl(p.url, p.options, v.values), price: rupees(v.price).replace(/,/g, ''), priceCurrency: 'INR',
    availability: SCHEMA_AVAIL[v.availability.google], itemCondition: 'https://schema.org/NewCondition',
    ...(v.availability.kind === 'preorder' ? { availabilityStarts: v.availability.availabilityDate } : {}),
  })
  // Identifiers (S2·3): the SKU is also the brand's part number (MPN); the barcode only when one was typed.
  const ids = (v: LdVariant) => ({ ...(v.sku ? { sku: v.sku, mpn: v.sku } : {}), ...(v.gtin ? { gtin: v.gtin } : {}) })
  const props = (values: string[]) => Object.fromEntries(p.options.map((o, i) => [/^colou?rs?$/i.test(o) ? 'color' : /^sizes?$/i.test(o) ? 'size' : o.toLowerCase(), values[i]]).filter(([k]) => k === 'color' || k === 'size'))
  const common = { brand: { '@type': 'Brand', name: p.brand }, description: p.description, ...(p.material ? { material: p.material } : {}), ...(p.gender ? { audience: { '@type': 'PeopleAudience', suggestedGender: p.gender } } : {}) }
  if (p.variants.length <= 1 || !p.options.length) {
    const v = p.variants[0]
    return { '@context': 'https://schema.org', '@type': 'Product', name: p.name, url: p.url, image: p.images, ...(v ? ids(v) : {}), ...common, ...(v ? { offers: offer(v) } : {}) }
  }
  return {
    '@context': 'https://schema.org', '@type': 'ProductGroup', name: p.name, url: p.url, productGroupID: p.groupId, ...common,
    variesBy: p.options.map((o) => (/^colou?rs?$/i.test(o) ? 'https://schema.org/color' : /^sizes?$/i.test(o) ? 'https://schema.org/size' : null)).filter(Boolean),
    hasVariant: p.variants.map((v) => ({ '@type': 'Product', name: `${p.name} – ${v.values.join(', ')}`, ...ids(v), image: v.image ? [v.image] : p.images, ...props(v.values), offers: offer(v) })),
  }
}

/** /products/kurta?colour=maroon&size=m — opens that variant; canonical is the bare URL. */
export function variantUrl(base: string, options: string[], values: string[]): string {
  const q = options.map((o, i) => `${encodeURIComponent(o.toLowerCase())}=${encodeURIComponent((values[i] ?? '').toLowerCase().replace(/\s+/g, '-'))}`).join('&')
  return q ? `${base}?${q}` : base
}

export type ShopLd = { name: string; url: string; logo: string | null; sameAs: string[]; returnDays: number; returnKind: string; shippingFlat: number; freeShippingAbove: number; metroDays: number; restDays: number; dispatchDays: number }

/** The shop as an Organization, with its return policy and shipping once (not repeated on every product). */
export function shopJsonLd(s: ShopLd): object {
  const returns = s.returnKind === 'none' || s.returnDays <= 0
    ? { '@type': 'MerchantReturnPolicy', applicableCountry: 'IN', returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted' }
    : { '@type': 'MerchantReturnPolicy', applicableCountry: 'IN', returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow', merchantReturnDays: s.returnDays, returnMethod: 'https://schema.org/ReturnByMail' }
  return {
    '@context': 'https://schema.org', '@type': 'OnlineStore', name: s.name, url: s.url, ...(s.logo ? { logo: s.logo } : {}), ...(s.sameAs.length ? { sameAs: s.sameAs } : {}),
    hasMerchantReturnPolicy: returns,
    hasShippingService: {
      '@type': 'ShippingService',
      // Days to dispatch before transit (S2·3; the data was already passed in).
      handlingTime: { '@type': 'ServicePeriod', duration: { '@type': 'QuantitativeValue', minValue: 0, maxValue: s.dispatchDays, unitCode: 'DAY' } },
      shippingConditions: [
        {
          '@type': 'ShippingConditions', shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'IN' },
          shippingRate: { '@type': 'MonetaryAmount', value: rupees(s.shippingFlat).replace(/,/g, ''), currency: 'INR' },
          transitTime: { '@type': 'ServicePeriod', duration: { '@type': 'QuantitativeValue', minValue: s.metroDays, maxValue: s.restDays, unitCode: 'DAY' } },
        },
        // Free above the shop's threshold (S2·3).
        ...(s.shippingFlat > 0 && s.freeShippingAbove > 0 ? [{
          '@type': 'ShippingConditions', shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'IN' },
          orderValue: { '@type': 'MonetaryAmount', minValue: rupees(s.freeShippingAbove).replace(/,/g, ''), currency: 'INR' },
          shippingRate: { '@type': 'MonetaryAmount', value: '0', currency: 'INR' },
          transitTime: { '@type': 'ServicePeriod', duration: { '@type': 'QuantitativeValue', minValue: s.metroDays, maxValue: s.restDays, unitCode: 'DAY' } },
        }] : []),
      ],
    },
  }
}

/** A description no longer than `max`, cut at a word (search and sharing S2·1: Google shows ~155 on a phone). */
export function trimmed(text: string, max = DESCRIPTION_WARN_AT): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length <= max ? t : t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…'
}

/** Descriptions for pages with none of their own (S2·1), from the shop's own facts. */
export const pageDescription = {
  list: (shop: string, codOn: boolean) => `Shop all of ${shop}${codOn ? ': pay on delivery' : ''}.`,
  collection: (title: string, own: string, shop: string) => (own.trim() ? trimmed(own) : `${title} from ${shop}.`),
  policy: (title: string, shop: string) => `${title} at ${shop}.`,
}

/** Home's title and description (S·3): the merchant's own, else the shop's name and tagline. */
export function homeSeo(s: { shopName: string; tagline: string; codOn: boolean; seoTitle: string; seoDescription: string }) {
  return {
    title: s.seoTitle.trim() || s.shopName,
    description: trimmed(s.seoDescription.trim() || s.tagline || `${s.shopName}: shop online${s.codOn ? ', pay on delivery' : ''}.`),
  }
}

/** A collection's page title and description (S2·2): the merchant's own, else made from its name and intro. */
export function collectionSeo(c: { title: string; description: string; seoTitle: string; seoDescription: string }, shop: string) {
  return { title: c.seoTitle.trim() || `${c.title} | ${shop}`, description: c.seoDescription.trim() ? trimmed(c.seoDescription) : pageDescription.collection(c.title, c.description, shop) }
}

/** Where a page sits (S2·3): Home › Collection › Product, as Google shows it under the result. */
export function breadcrumbJsonLd(items: { name: string; url: string }[]): object {
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url })) }
}

/** The site itself (S2·3): its name, so Google shows the shop's name, not its address. */
export const websiteJsonLd = (name: string, url: string): object => ({ '@context': 'https://schema.org', '@type': 'WebSite', name, url })

/** A collection's products, in the order shown (S2·3). */
export const itemListJsonLd = (urls: string[]): object => ({ '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: urls.map((url, i) => ({ '@type': 'ListItem', position: i + 1, url })) })
