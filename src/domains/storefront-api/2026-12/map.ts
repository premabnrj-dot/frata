// =============================================================================
// FILE: src/domains/storefront-api/2026-12/map.ts
//
// THE SHOP'S CACHED READS → VERSION 2026-12's ANSWERS, field by field (spec § 3; ADR-0003). Nothing is spread from a
// row: a field the schema doesn't name can't leave, and a merchant cost is never read here (check:api). Pure: `now` and
// the shop are passed in; every rule is the shop pages' own (listing.ts, availability.ts, offer-showcase.ts), never a
// second copy. Drafts and scheduled products never come out (isListed per request); a collection's or a product's
// links to them are dropped. Photos only from Frrata's media store, under this shop's own folder.
// =============================================================================

import { availability, bestOffer, type Availability as Avail } from '../../catalogue/availability'
import { cardBadge, liveLines, type ShowOffer } from '../../checkout/offer-showcase'
import { offerStatus } from '../../checkout/offer-status'
import { barText, type OfferWords } from '../../checkout/offer-text'
import { factsOf, inCollection, isListed, PAGE_SIZE, pageOf, priceOf, sortProducts, type ListCollection, type ListVariant } from '../../storefront/listing'
import type { z } from 'zod'
import { instagramHandle } from '../../settings/instagram'
import { urlFor } from '../../media/sizes'
import { detailsOf } from '../../catalogue/details'
import { labelRows, readLabel } from '../../catalogue/label'
import { pausedAt } from '../../plans/pause'
import { POLICY_PAGES } from '../../policies/render'
import type { PublicZone } from '../../delivery/public'
import { normaliseMobile } from '../../settings/mobile'
import type * as S from './schemas'

/** The most products the API reads from a catalogue (the cached entry's cap; past it: D3, later). */
export const CATALOGUE_CAP = 600
/** The last page a list can have: 600 ÷ 48, rounded up (13). The WAF path rule holds the same number (waf.test.ts). */
export const MAX_PAGE = Math.ceil(CATALOGUE_CAP / PAGE_SIZE)

type In<T extends z.ZodType> = z.input<T>
export type ImageIn = { base: string; widths: number[]; alt: string; width?: number; height?: number; optionValue?: string | null }
export type VariantIn = ListVariant & { id: string; sku?: string | null; gtin?: string | null }
export type CardIn = {
  id: string; handle: string; title: string; status: string; publishAt: string | null; since: string
  options: string[]; images: ImageIn[]; variants: VariantIn[]
  colours: { value: string; family: string | null; hex: string | null }[]
  categoryId: string | null; attributes: Record<string, string[]>; tags: string[]; offers?: ShowOffer[]
}
export type ProductIn = CardIn & {
  description: string; modelHeight?: string; modelSize?: string; seoTitle?: string; seoDescription?: string
  label?: Record<string, unknown>; originCountry?: string | null; stories: { title: string; text: string; notes: string[]; image?: ImageIn | null; photo?: ImageIn | null }[]
  pairs: CardIn[]; sizeChart: { columns: string[]; rows: { size: string; values: (number | null)[] }[]; howToMeasure: string } | null
}
export type CollectionIn = ListCollection & { id: string; handle: string; title: string; description: string; seoTitle?: string; seoDescription?: string }

/** Whose answer this is: the shop (from the key), and Frrata's own media store host (storeHost of BLOB_STORE_ID; null:
 *  no photos at all). A photo is kept only from that one store, under this shop's own folder (security review LOW-2). */
export type MapCtx = { tenantId: string; mediaHost: string | null }
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const fromOurStore = (m: MapCtx, url: string) => !!m.mediaHost && url.startsWith(`https://${m.mediaHost}/tenants/${m.tenantId}/`)

/** A photo only from Frrata's media store, in this shop's own folder; anything else is left out. */
export function imageOut(m: MapCtx, i: ImageIn | null | undefined): In<typeof S.Image> | null {
  if (!i) return null
  const ok = !!m.mediaHost && new RegExp(`^https://${esc(m.mediaHost)}/tenants/${m.tenantId}/[a-z]+/[A-Za-z0-9-]+(\\.jpg)?$`).test(i.base)
  if (!ok || !i.widths.length) return null
  const widths = [...i.widths].sort((a, b) => a - b).slice(0, 8)
  const big = widths[widths.length - 1]!
  return {
    sizes: widths.map((w) => ({ width: w, url: urlFor(i.base, w) })),
    width: i.width && i.width > 0 ? i.width : big, height: i.height && i.height > 0 ? i.height : Math.round(big * 1.25),
    alt: plain(i.alt, 200), colour: i.optionValue ? plain(i.optionValue, 60) : null,
  }
}

/**
 * Text as the merchant wrote it, without control characters, capped. It is TEXT: a site renders it as text, never as
 * HTML (the published description says so). Stripping "tags" here would be no boundary at all (an unclosed one passes)
 * and would eat real text ("chest < 40"): security review LOW-3.
 */
export function plain(s: string | null | undefined, max: number): string {
  return (s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max)
}

export function availabilityOut(a: Avail | null): In<typeof S.Availability> | null {
  if (!a) return null
  return {
    kind: a.kind,
    left: a.kind === 'low_stock' ? a.left : null,
    shipsBy: a.kind === 'preorder' ? a.shipsBy : null,
    leadDays: a.kind === 'made_to_order' ? a.leadDays : null,
  }
}

export function cardOut(m: MapCtx, p: CardIn, now: Date): In<typeof S.Card> {
  const price = priceOf(p)
  return {
    id: p.id, handle: p.handle, title: plain(p.title, 200),
    price: price ? { min: price.min, max: price.max, priorPrice: price.compareAt } : null,
    availability: availabilityOut(bestOffer(p.variants.map(factsOf), now)),
    colours: p.colours.slice(0, 40).map((c) => ({ value: plain(c.value, 60), family: c.family ? plain(c.family, 40) : null, hex: c.hex && /^#[0-9A-Fa-f]{6}$/.test(c.hex) ? c.hex : null })),
    image: imageOut(m, p.images[0]),
    badge: cardBadge(p.offers, now)?.label.slice(0, 60) ?? null,
  }
}

export function productOut(m: MapCtx, p: ProductIn, now: Date): In<typeof S.Product> {
  return {
    ...cardOut(m, p, now),
    description: plain(p.description, 5000),
    options: p.options.slice(0, 3).map((o) => plain(o, 40)),
    // Only sizes with a price: one without isn't for sale (the shop's markup skips it too).
    variants: p.variants.filter((v) => v.price > 0).slice(0, 300).map((v) => ({
      id: v.id, values: v.values.slice(0, 3).map((x) => plain(x, 60)), price: v.price,
      sku: v.sku ? plain(v.sku, 64) : null, gtin: v.gtin && /^\d{8,14}$/.test(v.gtin) ? v.gtin : null,
      priorPrice: v.compareAt !== null && v.compareAt > v.price ? v.compareAt : null,
      // The buy box's rule: an M.R.P. only at or above the price.
      mrp: v.mrp != null && v.mrp >= v.price ? v.mrp : null,
      availability: availabilityOut(availability(factsOf(v), now))!,
    })),
    images: p.images.slice(0, 20).map((i) => imageOut(m, i)).filter((i): i is NonNullable<typeof i> => i !== null),
    // The product page's own rows: the taxonomy's details, then what the pack declares (Legal Metrology).
    details: [...detailsOf(p), ...labelRows(readLabel(p.label ?? {}), p.originCountry ?? null)].slice(0, 40).map((d) => ({ name: plain(d.name, 80), value: plain(d.value, 400) })),
    model: p.modelHeight || p.modelSize ? { height: plain(p.modelHeight, 40), size: plain(p.modelSize, 20) } : null,
    seo: { title: plain(p.seoTitle || p.title, 200), description: plain(p.seoDescription, 400) },
    stories: p.stories.slice(0, 8).map((s) => ({ title: plain(s.title, 120), text: plain(s.text, 1200), notes: s.notes.slice(0, 10).map((n) => plain(n, 200)), image: imageOut(m, s.image ?? s.photo ?? null) })),
    pairs: p.pairs.filter((x) => isListed(x, now)).slice(0, 2).map((x) => cardOut(m, x, now)),
    sizeChart: p.sizeChart ? {
      columns: p.sizeChart.columns.slice(0, 12).map((c) => plain(c, 40)),
      rows: p.sizeChart.rows.slice(0, 40).map((r) => ({ size: plain(r.size, 20), values: r.values.slice(0, 12) })),
      howToMeasure: plain(p.sizeChart.howToMeasure, 2000),
    } : null,
    offers: liveLines(p.offers, now).map((o) => ({ label: plain(o.label, 200), endsAt: o.endsAt })),
  }
}

export const collectionOut = (c: Pick<CollectionIn, 'handle' | 'title' | 'description'> & { seoTitle?: string; seoDescription?: string }): In<typeof S.Collection> =>
  ({ handle: c.handle, title: plain(c.title, 200), description: plain(c.description, 2000), seo: { title: plain(c.seoTitle || c.title, 200), description: plain(c.seoDescription, 400) } })

/** The listed products, in the shop's order, a page of 48 (the shop's own paging). */
export function pageOut<P extends CardIn>(m: MapCtx, all: P[], page: number, now: Date): In<typeof S.Page> | null {
  const listed = all.filter((p) => isListed(p, now))
  const truncated = listed.length > CATALOGUE_CAP
  const capped = listed.slice(0, CATALOGUE_CAP)
  const { items, pages } = pageOf(capped, page)
  if (page > Math.max(1, pages)) return null
  return { products: items.map((p) => cardOut(m, p, now)), page, pages, total: capped.length, truncated }
}

export function collectionPageOut<P extends CardIn>(m: MapCtx, c: CollectionIn, all: P[], page: number, now: Date): In<typeof S.CollectionPage> | null {
  const listed = all.filter((p) => isListed(p, now))
  const members = sortProducts(inCollection(c, listed as never[], now) as P[], c.sort, c.productIds)
  const p = pageOut(m, members, page, now)
  return p ? { collection: collectionOut(c), ...p } : null
}

/** Search over the listed catalogue, in memory: every word of `q` in the title or a tag; at most 48. */
export function searchOut<P extends CardIn>(m: MapCtx, all: P[], q: string, now: Date): In<typeof S.Search> {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6)
  const hit = (p: P) => { const hay = `${p.title} ${p.tags.join(' ')}`.toLowerCase(); return words.every((w) => hay.includes(w)) }
  return { q: plain(q, 60), products: all.filter((p) => isListed(p, now) && hit(p)).slice(0, 48).map((p) => cardOut(m, p, now)) }
}

/** The announcement bar, exactly as the shop shows it: only while live, its real end only. */
export function offersOut(a: (OfferWords & { code: string | null; startsAt: string; endsAt: string | null; startedAt: string | null; pausedAt: string | null; endedAt: string | null; stoppedAt: string | null }) | null, now: Date): In<typeof S.Offers> {
  if (!a) return { bar: null }
  const d = (s: string | null) => (s ? new Date(s) : null)
  if (offerStatus({ startedAt: d(a.startedAt), pausedAt: d(a.pausedAt), endedAt: d(a.endedAt), stoppedAt: d(a.stoppedAt), startsAt: new Date(a.startsAt), endsAt: d(a.endsAt) }, now) !== 'live') return { bar: null }
  return { bar: { text: plain(barText(a, { code: a.code, endsAt: d(a.endsAt) }), 300), endsAt: a.endsAt } }
}

export type ShopIn = {
  publishedAt: string | null; pause: { from: string; to: string | null } | null; tagline: string; seoTitle: string; seoDescription: string
  codMin: number; zones: PublicZone[] | null
  shopName: string; shopLanguage: 'en' | 'hi'; logoUrl: string | null; pricesIncludeGst: boolean
  codOn: boolean; codMax: number; codCharge: number; shippingFlat: number; freeShippingAbove: number; dispatchDays: number; metroDays: number; restDays: number
  returnKind: 'exchange_or_refund' | 'exchange_only' | 'refund_only' | 'none'; returnDays: number
  legalName: string; address: string; supportEmail: string; supportPhone: string
  grievanceName: string; grievanceRole: string; grievanceEmail: string; grievancePhone: string
  instagram: string; whatsapp: string
}

/** The shop, with the legal block its website must show (E-Commerce Rules: runtime data, never compiled in). */
export function shopOut(m: MapCtx, s: ShopIn, origins: { site: string | null; checkout: string }, now: Date): In<typeof S.Shop> {
  const wa = normaliseMobile(s.whatsapp)
  const logo = s.logoUrl && fromOurStore(m, s.logoUrl) ? s.logoUrl : null
  return {
    name: plain(s.shopName, 120), tagline: plain(s.tagline, 200), language: s.shopLanguage, logo, pricesIncludeGst: s.pricesIncludeGst,
    // The shop's own gate (ShopFrame): not opened → "Opening soon"; inside a pause → no new orders.
    status: !s.publishedAt ? 'opening_soon' : pausedAt(s.pause, now) ? 'paused' : 'open',
    pause: s.pause ? { from: s.pause.from, to: s.pause.to } : null,
    payOnDelivery: { on: s.codOn, min: s.codMin, max: s.codMax, charge: s.codCharge },
    delivery: {
      charge: s.shippingFlat, freeAbove: s.freeShippingAbove, dispatchDays: s.dispatchDays, metroDays: s.metroDays, restDays: s.restDays,
      zones: s.zones?.length ? s.zones.slice(0, 50).map((z) => ({ name: plain(z.name, 60), charge: z.charge, freeAbove: z.freeAbove, days: [z.daysMin, z.daysMax] as [number, number], payOnDelivery: { on: z.codOn, charge: z.codCharge, max: z.codMax } })) : null,
    },
    policies: POLICY_PAGES.map(([kind, title]) => ({ kind, title, url: `${origins.checkout}/policies/${kind}` })),
    seo: { title: plain(s.seoTitle || s.shopName, 200), description: plain(s.seoDescription, 400) },
    returns: { kind: s.returnKind, days: s.returnDays },
    legal: {
      legalName: plain(s.legalName, 120), address: plain(s.address, 400),
      customerCare: { email: plain(s.supportEmail, 200), phone: plain(s.supportPhone, 20) },
      grievanceOfficer: { name: plain(s.grievanceName, 120), role: plain(s.grievanceRole, 80), email: plain(s.grievanceEmail, 200), phone: plain(s.grievancePhone, 20) },
    },
    social: { instagram: instagramHandle(s.instagram), whatsapp: wa ? `91${wa}` : null },
    siteOrigin: origins.site, checkoutOrigin: origins.checkout,
  }
}
