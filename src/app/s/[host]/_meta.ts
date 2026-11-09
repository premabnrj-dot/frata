import type { Metadata } from 'next'
import { pageTags, type PageFacts, type PageTags } from '@/domains/seo/tags'
import type { StoreShop } from '@/lib/queries/storefront'

/**
 * A shop page's tags (src/domains/seo/tags.ts, the one writer) as Next metadata. og:type for a product and the
 * product:* tags are not in Next's Open Graph types: <ProductTags> renders them as property= meta tags, which React
 * places in the <head> of the static page (64-seo checks the raw head).
 */
export function toMetadata(t: PageTags): Metadata {
  const img = t.og.image
  return {
    title: { absolute: t.title },
    ...(t.description ? { description: t.description } : {}),
    alternates: { canonical: t.canonical },
    robots: t.robots.index ? { index: true, follow: true, 'max-image-preview': 'large' } : { index: false, follow: false },
    openGraph: {
      ...(t.og.type === 'website' ? { type: 'website' as const } : {}),
      url: t.og.url, title: t.og.title, siteName: t.og.siteName, locale: t.og.locale,
      ...(t.og.description ? { description: t.og.description } : {}),
      ...(img ? { images: [{ url: img.url, width: img.width, ...(img.height ? { height: img.height } : {}), alt: img.alt, type: img.type }] } : {}),
    },
    twitter: { card: t.twitter.card, ...(img ? { images: [{ url: img.url, alt: img.alt }] } : {}) },
  }
}

/** A shop page's facts with the shop's own parts filled in: its host, name, language, and noindex until it opens. */
export function shopTags(shop: StoreShop, f: Omit<PageFacts, 'host' | 'shopName' | 'lang' | 'indexable'> & { indexable?: boolean }): PageTags {
  return pageTags({ ...f, host: shop.host, shopName: shop.shopName, lang: shop.shopLanguage === 'hi' ? 'hi' : 'en', indexable: !!shop.publishedAt && (f.indexable ?? true) })
}
