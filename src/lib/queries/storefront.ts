import 'server-only'
import { and, asc, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import { revalidateTag, unstable_cache } from 'next/cache'
import { shopPauseIn } from './trial-pause'
import { cache } from 'react'
import { LOW_STOCK_AT } from '@/domains/catalogue/availability'
import type { Chart } from '@/domains/catalogue/size-charts'
import type { PolicyFacts } from '@/domains/policies/render'
import type { DeliveryRules } from '@/domains/checkout/delivery'
import { tenantForHost, themeVersionRows } from '@/lib/db/platform'
import { shopPolicies, shopSettings, tenants } from '@/lib/db/schema'
import { collectionProducts, collections, productAttributes, productColours, productHandleHistory, productImages, products, productTypes, variants } from '@/lib/db/schema-catalogue'
import { owedSql, stateSql } from '@/lib/db/order-predicates'
import { priorPriceSql } from '@/lib/db/price-predicates'
import { orderLines, orders } from '@/lib/db/schema-orders'
import { liveCandidates, revisionOf, type Revision } from '@/lib/themes/look'
import { liveOf, withdrawnKeys } from '@/domains/themes/release'
import { withTenant } from '@/lib/db/tenant'
import { discountCodes, discountTargets, discountTiers, discounts } from '@/lib/db/schema-discounts'
import { barText, bxgyText, offOf, offerTerms } from '@/domains/checkout/offer-text'
import type { ShowOffer } from '@/domains/checkout/offer-showcase'
import type { Tx } from '@/lib/db'
import { shopHost } from '@/lib/public-env'
import { cleanRules, matches } from '@/domains/catalogue/collection-rules'
import { productFactsIn } from './catalogue'
import { compactCard, expand, photoPrefixOf, type CatalogueEntry } from '@/lib/storefront/catalogue-entry'

// =============================================================================
// WHAT A SHOPPER'S PAGE READS (storefront spec 2026-11-07, § Review findings).
// - Named columns only (check:tenant 6b): no merchant cost, weight, raw stock
//   (clamped to LOW_STOCK_AT + 1, which availability() reads the same), cap
//   (only whether pre-orders are full), HSN, pickup pincode or COD pincodes.
// - RAW rows, dates as ISO strings: visibility() and availability() run at
//   render, because a cached `now` would hide a scheduled drop forever.
// - shop* loaders are cached per tenant (shopCached: tenant first in the key
//   and in every tag, 60 s backstop); preview* loaders are the same core,
//   uncached, drafts included, for /console/preview only. No exported loader
//   takes a preview flag.
// =============================================================================

type Loader<A extends unknown[], R> = (tenantId: string, ...a: A) => Promise<R>

/** The one cache wrapper (check:tenant 6d). Built per call so the tags carry this tenant. */
/** `revalidate`: the backstop in seconds (default 60; Best sellers 3600: unit-economics review 2026-11-08). */
// React cache() on top (speed review P3): unstable_cache does not merge misses already in flight, and layout,
// generateMetadata and page render in parallel — each ran the same queries on its own connection.
function shopCached<A extends (string | number)[], R>(name: string, scope: 'shop' | 'catalogue', fn: Loader<A, R>, revalidate = 60): Loader<A, R> {
  return cache((tenantId: string, ...a: A) => unstable_cache(() => fn(tenantId, ...a), ['sf', name, tenantId, ...a.map(String)], {
    tags: [`shop:${tenantId}`, ...(scope === 'catalogue' ? [`shop:${tenantId}:catalogue`] : [])], revalidate,
  })())
}

export { refreshHosts, refreshShop, refreshSoldOut } from '@/lib/storefront/refresh'
export const hostFor = shopHost

class Miss extends Error {}
/**
 * Which shop a host is, and where an old name moved to. A miss is never cached (anyone can mint subdomains); a hit lives
 * 60 s or until its tag. The key is versioned: the data cache outlives a deploy (shop addresses D·1, review M14).
 */
const hostFacts = cache(async (host: string): Promise<{ id: string; movedTo: string | null } | null> => {
  try {
    return await unstable_cache(async () => { const t = await tenantForHost(host); if (!t) throw new Miss(); return { id: t.id, movedTo: t.movedTo } }, ['sf-host-v2', host], { tags: [`host:${host}`], revalidate: 60 })()
  } catch (e) {
    if (e instanceof Miss) return null
    throw e
  }
})
export const shopIdForHost = async (host: string): Promise<string | null> => (await hostFacts(host))?.id ?? null
/** The shop's current address when `host` is one of its old names; null for its current one. */
export const shopMovedTo = async (host: string): Promise<string | null> => (await hostFacts(host))?.movedTo ?? null

// ── The shop ───────────────────────────────────────────────────────────────────

/** The language of the words Frrata writes on a shop (shop_settings.shop_language). */
export type Lang = 'en' | 'hi'
export type StoreShop = PolicyFacts & DeliveryRules & {
  id: string; slug: string; host: string; publishedAt: string | null; orderPrefix: string
  /** Trials TR1·9: the pause window (ISO); the page decides at render (pausedAt), so the 60 s cache never delays it. */
  pause: { from: string; to: string | null } | null
  accent: string; displayFont: string; tagline: string; logoUrl: string | null; whatsapp: string; instagram: string
  /** The words Frrata writes on the shop (themes T2). */
  shopLanguage: Lang
  overrides: Record<string, string>; nav: { handle: string; title: string }[]
}

async function coreShop(tenantId: string): Promise<StoreShop | null> {
  return withTenant(tenantId, async (tx) => {
    const [r] = await tx.select({
      name: tenants.name, slug: tenants.slug, publishedAt: shopSettings.publishedAt, orderPrefix: shopSettings.orderPrefix,
      legalName: shopSettings.legalName, address: shopSettings.address, supportEmail: shopSettings.supportEmail, supportPhone: shopSettings.supportPhone,
      whatsapp: shopSettings.whatsapp, instagram: shopSettings.instagram,
      grievanceName: shopSettings.grievanceName, grievanceRole: shopSettings.grievanceRole, grievanceEmail: shopSettings.grievanceEmail, grievancePhone: shopSettings.grievancePhone,
      accent: shopSettings.accent, displayFont: shopSettings.displayFont, tagline: shopSettings.tagline, logoUrl: shopSettings.logoUrl, shopLanguage: shopSettings.shopLanguage,
      returnKind: shopSettings.returnKind, returnDays: shopSettings.returnDays,
      // COD limits are public: the Shipping policy states them.
      codOn: shopSettings.codOn, codMin: shopSettings.codMin, codMax: shopSettings.codMax, codCharge: shopSettings.codCharge,
      shippingFlat: shopSettings.shippingFlat, freeShippingAbove: shopSettings.freeShippingAbove,
      dispatchDays: shopSettings.dispatchDays, metroDays: shopSettings.metroDays, restDays: shopSettings.restDays, pricesIncludeGst: shopSettings.pricesIncludeGst,
    }).from(tenants).innerJoin(shopSettings, eq(shopSettings.tenantId, tenants.id)).where(eq(tenants.id, tenantId)).limit(1)
    if (!r) return null
    const [pol, nav, pause] = await Promise.all([
      tx.select({ kind: shopPolicies.kind, body: shopPolicies.body }).from(shopPolicies).where(eq(shopPolicies.tenantId, tenantId)),
      // The header's collections: the first five by name (spec § Review findings).
      tx.select({ handle: collections.handle, title: collections.title }).from(collections).where(eq(collections.tenantId, tenantId)).orderBy(asc(collections.title)).limit(5),
      shopPauseIn(tx, tenantId),
    ])
    return {
      ...r, shopName: r.name, id: tenantId, host: hostFor(r.slug), publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
      pause: pause ? { from: pause.from.toISOString(), to: pause.to ? pause.to.toISOString() : null } : null,
      returnKind: r.returnKind as PolicyFacts['returnKind'], shopLanguage: r.shopLanguage === 'hi' ? 'hi' : 'en',
      codMin: Number(r.codMin), codMax: Number(r.codMax), codCharge: Number(r.codCharge), shippingFlat: Number(r.shippingFlat), freeShippingAbove: Number(r.freeShippingAbove),
      overrides: Object.fromEntries(pol.map((p) => [p.kind, p.body])), nav,
    }
  })
}

// ── The catalogue: every product a list can show, and the collections ───────────

export type StoreImage = { id: string; base: string; widths: number[]; width: number; height: number; optionValue: string | null; alt: string }
export type StoreVariant = { id: string; values: string[]; sku: string | null; price: number
  /** The 30-day prior price when the price was cut within 30 days (derived); null otherwise. */
  compareAt: number | null
  /** The tag's M.R.P. as the merchant typed it (never struck through). */
  mrp: number | null; stock: number; whenOut: 'stop' | 'preorder' | 'made_to_order'; shipsBy: string | null; leadMinDays: number | null; leadMaxDays: number | null; preorderFull: boolean; restockedAt: string | null }
export type StoreColour = { value: string; family: string | null; hex: string | null; cropImageId: string | null; crop: { x: number; y: number; r: number } | null }
export type StoreCard = {
  id: string; handle: string; title: string; status: string; publishAt: string | null; since: string
  options: string[]; images: StoreImage[]; variants: StoreVariant[]; colours: StoreColour[]
  categoryId: string | null; attributes: Record<string, string[]>; tags: string[]
  /** Offers the shop shows on this product, raw (live decided at render: offer-showcase.ts). */
  offers?: ShowOffer[]
  /** A sample piece in the customizer's preview (src/lib/themes/sample.ts); never set by a read here. */
  sample?: true
}
export type StoreCollection = { id: string; handle: string; title: string; description: string; kind: 'manual' | 'auto'; matchAll: boolean; rules: unknown[]; sort: string; productIds: string[] }
export type StoreCatalogue = { products: StoreCard[]; collections: StoreCollection[] }

/** A cached entry must stay well under the data cache's 2 MB: lists show at most this many products. */
const MAX_LISTED = 600

/**
 * A variant as the shop shows it; `owed` from the same SQL checkout reads, so the two agree. Read when the cache
 * fills: a pre-order cancelled or packed shows on the product page at the next 60 s revalidate (checkout is always
 * current, so nothing is ever sold twice).
 */
const variantCols = (tenantId: string) => ({
  owed: owedSql(tenantId, new Date()),
  id: variants.id, productId: variants.productId, values: variants.optionValues, sku: variants.sku, price: variants.price,
  // The struck "was" price is DERIVED, never typed (E-Commerce Amendment Rules 2026, from 1 Jan 2027; offers O·2 plan
  // review 10): the lowest price in the 30 days before today's price took effect (the price carried into that window
  // included), shown only within 30 days of that change. A raise-then-cut never shows a saving. The merchant's typed
  // compare-at is the tag's M.R.P. (`mrp`), never struck through.
  compareAt: priorPriceSql(tenantId),
  mrp: variants.compareAt,
  stock: variants.stock, whenOut: variants.whenOut, shipsBy: variants.shipsBy, leadMinDays: variants.leadMinDays, leadMaxDays: variants.leadMaxDays, cap: variants.preorderCap,
  restockedAt: variants.restockedAt,
})
const imageCols = { id: productImages.id, productId: productImages.productId, base: productImages.base, widths: productImages.widths, width: productImages.width, height: productImages.height, optionValue: productImages.optionValue, alt: productImages.alt }
const colourCols = { productId: productColours.productId, value: productColours.value, family: productColours.family, hex: productColours.hex, cropImageId: productColours.cropImageId, crop: productColours.crop }

const toVariant = (v: { id: string; values: string[]; sku: string | null; price: number; compareAt: string | number | null; mrp: number | null; stock: number; owed: number; whenOut: string; shipsBy: string | null; leadMinDays: number | null; leadMaxDays: number | null; cap: number | null; restockedAt: Date | null }): StoreVariant => ({
  id: v.id, values: v.values, sku: v.sku, price: Number(v.price), compareAt: v.compareAt !== null && Number(v.compareAt) > Number(v.price) ? Number(v.compareAt) : null,
  mrp: v.mrp === null ? null : Number(v.mrp),
  // Shoppers learn "only N left" at LOW_STOCK_AT or below; above it, the count is not theirs to see.
  stock: Math.min(Math.max(0, v.stock - v.owed), LOW_STOCK_AT + 1), whenOut: v.whenOut as StoreVariant['whenOut'], shipsBy: v.shipsBy, leadMinDays: v.leadMinDays, leadMaxDays: v.leadMaxDays,
  // No orders before 1C, so pre-orders are full only at a cap of 0; 1C counts them.
  preorderFull: v.cap !== null && v.cap <= 0,
  restockedAt: v.restockedAt ? v.restockedAt.toISOString() : null,
})

/**
 * The shop's started, unended, listed offers as the showcase reads them (offers O·2): words and timestamps only, never
 * a limit, budget or count (ADR-0003). Product offers carry the products they cover (collections resolved now).
 */
type Showcase = { shop: ShowOffer[]; byProduct: (id: string) => ShowOffer[]; product: ShowOffer[]; indexFor: (id: string) => number[] }
async function showcase(tx: Tx, tenantId: string): Promise<Showcase> {
  const rows = await tx.select({
    id: discounts.id, title: discounts.title, style: discounts.style, percentBps: discounts.percentBps, amountOff: discounts.amountOff, minSubtotal: discounts.minSubtotal,
    targets: discounts.targets, buyQty: discounts.buyQty, getQty: discounts.getQty, getBps: discounts.getBps, firstOrder: discounts.firstOrder, code: discountCodes.code,
    startsAt: discounts.startsAt, endsAt: discounts.endsAt, startedAt: discounts.startedAt, pausedAt: discounts.pausedAt, endedAt: discounts.endedAt, stoppedAt: discounts.stoppedAt,
  }).from(discounts).leftJoin(discountCodes, and(eq(discountCodes.tenantId, discounts.tenantId), eq(discountCodes.discountId, discounts.id), isNull(discountCodes.label)))
    .where(and(eq(discounts.tenantId, tenantId), sql`${discounts.startedAt} is not null and ${discounts.endedAt} is null and ${discounts.listed}`))
  if (!rows.length) return { shop: [], byProduct: () => [], product: [], indexFor: () => [] }
  const tiers = await tx.select({ discountId: discountTiers.discountId, min: discountTiers.minSubtotal, percentBps: discountTiers.percentBps, amountOff: discountTiers.amountOff }).from(discountTiers)
    .where(and(eq(discountTiers.tenantId, tenantId), inArray(discountTiers.discountId, rows.map((r) => r.id)))).orderBy(asc(discountTiers.minSubtotal))
  const narrowed = rows.filter((r) => r.targets !== 'all').map((r) => r.id)
  const targets = narrowed.length ? await tx.select({ discountId: discountTargets.discountId, productId: discountTargets.productId, collectionId: discountTargets.collectionId }).from(discountTargets)
    .where(and(eq(discountTargets.tenantId, tenantId), inArray(discountTargets.discountId, narrowed))) : []
  // In THIS transaction (speed review P4): a cached loader here opened a second connection mid-transaction.
  const members = targets.some((t) => t.collectionId) ? await collectionMembersIn(tx, tenantId) : {}
  const iso = (x: Date | null) => (x ? x.toISOString() : null)
  const all = rows.map((r) => {
    const words = { title: r.title, style: r.style, percentBps: r.percentBps, amountOff: r.amountOff === null ? null : Number(r.amountOff), minSubtotal: Number(r.minSubtotal),
      targets: r.targets, buyQty: r.buyQty, getQty: r.getQty, getBps: r.getBps, firstOrder: r.firstOrder,
      tiers: tiers.filter((x) => x.discountId === r.id).map((x) => ({ min: Number(x.min), percentBps: x.percentBps, amountOff: x.amountOff === null ? null : Number(x.amountOff) })) }
    const product = r.style === 'product_off' || r.style === 'bxgy'
    const label = (r.style === 'pay_online' ? barText(words, { code: null, endsAt: null }) : offerTerms(words)) + (r.code && !product ? ` · code ${r.code.toUpperCase()}` : '')
    return {
      offer: { label: product ? `${r.title}: ${offerTerms({ ...words, targets: 'all' })}` : label, badge: r.style === 'bxgy' ? bxgyText(words) : r.style === 'product_off' ? offOf(words, false) : null, product,
        startsAt: r.startsAt.toISOString(), endsAt: iso(r.endsAt), startedAt: iso(r.startedAt), pausedAt: iso(r.pausedAt), endedAt: iso(r.endedAt), stoppedAt: iso(r.stoppedAt) } satisfies ShowOffer,
      covers: !product ? null : r.targets === 'all' ? 'all' as const : new Set(targets.filter((t) => t.discountId === r.id).flatMap((t) => (t.productId ? [t.productId] : members[t.collectionId!] ?? []))),
    }
  })
  const productOffers = all.filter((a) => a.covers !== null)
  const indexFor = (id: string) => productOffers.flatMap((a, i) => (a.covers === 'all' || (a.covers instanceof Set && a.covers.has(id)) ? [i] : []))
  return {
    shop: all.filter((a) => a.covers === null).map((a) => a.offer),
    byProduct: (id) => indexFor(id).map((i) => productOffers[i]!.offer),
    product: productOffers.map((a) => a.offer),
    indexFor,
  }
}

async function coreCatalogue(tenantId: string, drafts: boolean): Promise<CatalogueEntry> {
  return withTenant(tenantId, async (tx) => {
    const ps = await tx.select({
      id: products.id, handle: products.handle, title: products.title, status: products.status, publishAt: products.publishAt,
      since: sql<string>`coalesce(${products.publishAt}, ${products.publishedAt}, ${products.createdAt})`, options: products.options,
      categoryId: products.taxonomyCategory, tags: products.tags,
    }).from(products)
      .where(and(eq(products.tenantId, tenantId), drafts ? ne(products.status, 'archived') : eq(products.status, 'active')))
      .orderBy(desc(sql`coalesce(${products.publishAt}, ${products.publishedAt}, ${products.createdAt})`)).limit(MAX_LISTED)
    const ids = ps.map((p) => p.id)
    const [vs, imgs, cols, attrs, colls, members] = ids.length ? await Promise.all([
      tx.select(variantCols(tenantId)).from(variants).where(and(eq(variants.tenantId, tenantId), inArray(variants.productId, ids), sql`${variants.archivedAt} is null`)).orderBy(asc(variants.position)),
      tx.select(imageCols).from(productImages).where(and(eq(productImages.tenantId, tenantId), inArray(productImages.productId, ids))).orderBy(asc(productImages.position)),
      tx.select(colourCols).from(productColours).where(and(eq(productColours.tenantId, tenantId), inArray(productColours.productId, ids))),
      tx.select({ productId: productAttributes.productId, attribute: productAttributes.attribute, values: productAttributes.values }).from(productAttributes).where(and(eq(productAttributes.tenantId, tenantId), inArray(productAttributes.productId, ids))),
      tx.select({ id: collections.id, handle: collections.handle, title: collections.title, description: collections.description, kind: collections.kind, matchAll: collections.matchAll, rules: collections.rules, sort: collections.sort }).from(collections).where(eq(collections.tenantId, tenantId)).orderBy(asc(collections.title)),
      tx.select({ collectionId: collectionProducts.collectionId, productId: collectionProducts.productId }).from(collectionProducts).where(eq(collectionProducts.tenantId, tenantId)).orderBy(asc(collectionProducts.position)),
    ]) : [[], [], [], [], [], []] as const
    const show = await showcase(tx, tenantId)
    const photoPrefix = photoPrefixOf(imgs.map((i) => i.base))
    return {
      photoPrefix,
      offers: show.product,
      products: ps.map((p) => compactCard({
        id: p.id, handle: p.handle, title: p.title, status: p.status, publishAt: p.publishAt ? p.publishAt.toISOString() : null, since: new Date(p.since).toISOString(), options: p.options,
        categoryId: p.categoryId, tags: p.tags,
        images: imgs.filter((i) => i.productId === p.id).map(({ productId: _, ...i }) => i),
        variants: vs.filter((v) => v.productId === p.id).map(toVariant),
        colours: cols.filter((c) => c.productId === p.id).map(({ productId: _, ...c }) => c),
        attributes: Object.fromEntries(attrs.filter((a) => a.productId === p.id).map((a) => [a.attribute, a.values])),
      }, show.indexFor(p.id), photoPrefix)),
      collections: colls.map((c) => ({ ...c, kind: c.kind as 'manual' | 'auto', matchAll: c.matchAll === 1, rules: c.rules, productIds: members.filter((m) => m.collectionId === c.id).map((m) => m.productId) })),
    }
  })
}

// ── One product, everything its page shows ──────────────────────────────────────

export type StoreProduct = StoreCard & {
  description: string; modelHeight: string; modelSize: string; optionValues: string[][]; seoTitle: string; seoDescription: string
  typeName: string | null; sizeChart: Chart | null
}
/** current: this handle is the product's; moved: an old handle, with the current one; gone: none. */
export type Lookup = { kind: 'current'; product: StoreProduct } | { kind: 'moved'; to: string } | { kind: 'none' }

/** Handles a shop answers for: current ones (not drafts) and old ones. Unknown handles 404 here before any product query. */
async function coreHandles(tenantId: string, drafts: boolean): Promise<{ current: string[]; old: Record<string, string> }> {
  return withTenant(tenantId, async (tx) => {
    const cur = await tx.select({ handle: products.handle }).from(products).where(and(eq(products.tenantId, tenantId), drafts ? sql`true` : ne(products.status, 'draft')))
    const old = await tx.select({ old: productHandleHistory.handle, to: products.handle }).from(productHandleHistory)
      .innerJoin(products, and(eq(products.id, productHandleHistory.productId), eq(products.tenantId, tenantId)))
      .where(eq(productHandleHistory.tenantId, tenantId))
    return { current: cur.map((c) => c.handle), old: Object.fromEntries(old.map((o) => [o.old, o.to])) }
  })
}

async function coreProduct(tenantId: string, handle: string, drafts: boolean): Promise<StoreProduct | null> {
  return withTenant(tenantId, async (tx) => {
    const [p] = await tx.select({
      id: products.id, handle: products.handle, title: products.title, status: products.status, publishAt: products.publishAt,
      since: sql<string>`coalesce(${products.publishAt}, ${products.publishedAt}, ${products.createdAt})`, options: products.options, optionValues: products.optionValues,
      categoryId: products.taxonomyCategory, tags: products.tags, description: products.description, modelHeight: products.modelHeight, modelSize: products.modelSize,
      seoTitle: products.seoTitle, seoDescription: products.seoDescription, typeName: productTypes.name, sizeChart: productTypes.sizeChart,
    }).from(products).leftJoin(productTypes, and(eq(productTypes.id, products.typeId), eq(productTypes.tenantId, tenantId)))
      .where(and(eq(products.tenantId, tenantId), eq(products.handle, handle), drafts ? sql`true` : ne(products.status, 'draft'))).limit(1)
    if (!p) return null
    const mine = <T extends { tenantId: unknown; productId: unknown }>(t: T) => and(eq(t.tenantId as never, tenantId), eq(t.productId as never, p.id))
    const [vs, imgs, cols, attrs] = await Promise.all([
      tx.select(variantCols(tenantId)).from(variants).where(and(mine(variants), sql`${variants.archivedAt} is null`)).orderBy(asc(variants.position)),
      tx.select(imageCols).from(productImages).where(mine(productImages)).orderBy(asc(productImages.position)),
      tx.select(colourCols).from(productColours).where(mine(productColours)),
      tx.select({ attribute: productAttributes.attribute, values: productAttributes.values }).from(productAttributes).where(mine(productAttributes)),
    ])
    return {
      ...p, publishAt: p.publishAt ? p.publishAt.toISOString() : null, since: new Date(p.since).toISOString(),
      images: imgs.map(({ productId: _, ...i }) => i), variants: vs.map(toVariant), colours: cols.map(({ productId: _, ...c }) => c),
      attributes: Object.fromEntries(attrs.map((a) => [a.attribute, a.values])), sizeChart: p.sizeChart ?? null, typeName: p.typeName ?? null,
      // Its own product offers, then the shop's (raw; live decided at render).
      offers: await showcase(tx, tenantId).then((sh) => [...sh.byProduct(p.id), ...sh.shop]),
    }
  })
}

async function lookup(handles: { current: string[]; old: Record<string, string> }, get: () => Promise<StoreProduct | null>, handle: string): Promise<Lookup> {
  if (handles.current.includes(handle)) { const product = await get(); return product ? { kind: 'current', product } : { kind: 'none' } }
  const to = handles.old[handle]
  return to ? { kind: 'moved', to } : { kind: 'none' }
}

// ── The shop's look (themes T1): the latest publish row, never a draft ──────────

export type StoredLook = { revisionId: string; themeKey: string; themeVersion: string; styleKey: string; settings: unknown }
const stored = (r: Revision | null): StoredLook | null => (r ? { revisionId: r.id, themeKey: r.themeKey, themeVersion: r.themeVersion, styleKey: r.styleKey, settings: r.settings } : null)

// Which revision is live (liveOf), and which revision an id names, are src/lib/themes/look.ts's and release.ts's rules.
// The shop caches its recent publishes; which versions are withdrawn is one platform read for every shop (tag
// `themes`), so a withdraw is one revalidation, whatever the number of shops (T3 review).
const corePublishes = (tenantId: string) => withTenant(tenantId, async (tx) => (await liveCandidates(tx, tenantId)).map((p) => stored(p.revision)!))
// The cache hands back JSON (dates as strings): only whether a date is set matters to withdrawnKeys, so the rows are
// read as they come.
const versionStates = unstable_cache(() => themeVersionRows(), ['sf-theme-versions'], { tags: ['themes'], revalidate: 300 })
/** After Admin withdraws or recalls a version: every shop re-reads which versions it may render. */
export const refreshThemeVersions = () => revalidateTag('themes')

/** A revision of THIS shop for its own preview (a draft or an old look). Another shop's id and a missing id read the same: null. */
export const previewRevision = (tenantId: string, revisionId: string) => withTenant(tenantId, async (tx) => stored(await revisionOf(tx, tenantId, revisionId)))

/** Best sellers: product ids by delivered units in the window, most first. Ids only: a count never leaves the server (ADR-0003). */
async function coreBestSellers(tenantId: string, days: number): Promise<string[]> {
  const now = new Date()
  const since = new Date(now.getTime() - days * 86_400_000)
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.select({ productId: orderLines.productId }).from(orderLines)
      .innerJoin(orders, and(eq(orders.tenantId, orderLines.tenantId), eq(orders.id, orderLines.orderId)))
      .where(and(eq(orders.tenantId, tenantId), sql`${orders.deliveredAt} >= ${since.toISOString()}`, sql`${stateSql(now)} = 'delivered'`, sql`${orderLines.productId} is not null`))
      .groupBy(orderLines.productId).orderBy(sql`sum(${orderLines.qty}) desc`, orderLines.productId).limit(60)
    return rows.map((r) => r.productId!).filter(Boolean)
  })
}

// ── Exports: cached for shoppers, uncached for the merchant's preview ──────────

// A new key: the T1 entry 'look' held one look, this holds a list (a cache that survives a deploy must not meet the old shape).
const shopPublishes = shopCached('publishes', 'shop', (t) => corePublishes(t))
/** The shop's live look: its newest publish whose version isn't withdrawn (liveOf). */
export const shopLook = async (tenantId: string): Promise<StoredLook | null> => liveOf(await shopPublishes(tenantId), withdrawnKeys(await versionStates()))
export const shopBestSellers = shopCached('best', 'catalogue', (t, days: number) => coreBestSellers(t, days), 3600)
export const previewLook = async (tenantId: string): Promise<StoredLook | null> => liveOf(await corePublishes(tenantId), withdrawnKeys(await themeVersionRows()))
export const previewBestSellers = (tenantId: string, days: number) => coreBestSellers(tenantId, days)

export const shopSettingsFor = shopCached('shop', 'shop', (t) => coreShop(t))

/**
 * The offer in the shop's announcement bar (one at most), as RAW terms and timestamps: whether it is live is decided
 * when the page renders (offerStatus) — pages regenerate every 60 s, so up to a minute late. Shopper-safe fields only — never a limit, budget or count (ADR-0003).
 */
export const shopAnnouncement = shopCached('announce', 'shop', (tenantId) => withTenant(tenantId, async (tx) => {
  const [r] = await tx.select({
    title: discounts.title, style: discounts.style, percentBps: discounts.percentBps, amountOff: discounts.amountOff, minSubtotal: discounts.minSubtotal, listed: discounts.listed,
    startsAt: discounts.startsAt, endsAt: discounts.endsAt, startedAt: discounts.startedAt, pausedAt: discounts.pausedAt, endedAt: discounts.endedAt, stoppedAt: discounts.stoppedAt, code: discountCodes.code,
  }).from(discounts).leftJoin(discountCodes, and(eq(discountCodes.tenantId, discounts.tenantId), eq(discountCodes.discountId, discounts.id), isNull(discountCodes.label)))
    .where(and(eq(discounts.tenantId, tenantId), eq(discounts.announce, true))).limit(1)
  if (!r) return null
  const iso = (d: Date | null) => (d ? d.toISOString() : null)
  return { title: r.title, style: r.style, percentBps: r.percentBps, amountOff: r.amountOff === null ? null : Number(r.amountOff), minSubtotal: Number(r.minSubtotal),
    code: r.listed && r.code ? r.code.toUpperCase() : null, startsAt: r.startsAt.toISOString(), endsAt: iso(r.endsAt), startedAt: iso(r.startedAt), pausedAt: iso(r.pausedAt), endedAt: iso(r.endedAt), stoppedAt: iso(r.stoppedAt) }
}))
// A new key: the entry's shape changed (offers by index), and a cache that survives a deploy must not meet the old one.
const shopCatalogueEntry = shopCached('catalogue-v2', 'catalogue', (t) => coreCatalogue(t, false))
export const shopCatalogue = async (tenantId: string): Promise<StoreCatalogue> => expand(await shopCatalogueEntry(tenantId))
/** The entry exactly as the cache stores it (its size is what Next's 2 MB limit reads; catalogue-size.int.test.ts). */
export const catalogueEntry = (tenantId: string) => coreCatalogue(tenantId, false)

/**
 * Which products each collection holds now — hand-picked rows, or rule matches (collection-rules.ts, the same matching
 * the collections list uses) — for product offers' targets (offers O·2 plan review 9). Product ids only; cached with the
 * catalogue (60 s), so a product joining a rule collection reaches its offer within a minute.
 */
/** collectionMembers, in the caller's tenant transaction: placement prices with members read now, under its locks. */
export async function collectionMembersIn(tx: Tx, tenantId: string): Promise<Record<string, string[]>> {
  const cols = await tx.select({ id: collections.id, kind: collections.kind, matchAll: collections.matchAll, rules: collections.rules }).from(collections).where(eq(collections.tenantId, tenantId))
  const picked = await tx.select({ collectionId: collectionProducts.collectionId, productId: collectionProducts.productId }).from(collectionProducts).where(eq(collectionProducts.tenantId, tenantId))
  const auto = cols.filter((c) => c.kind === 'auto')
  const facts = auto.length ? await productFactsIn(tx, tenantId) : []
  return Object.fromEntries(cols.map((c) => [c.id, c.kind === 'auto'
    ? facts.filter((f) => matches(cleanRules(c.rules), c.matchAll === 1, f)).map((f) => f.id)
    : picked.filter((p) => p.collectionId === c.id).map((p) => p.productId)]))
}

export const collectionMembers = shopCached('collection-members', 'catalogue', (tenantId): Promise<Record<string, string[]>> => withTenant(tenantId, (tx) => collectionMembersIn(tx, tenantId)))
const shopHandles = shopCached('handles', 'catalogue', (t) => coreHandles(t, false))
const shopProductRow = shopCached('product', 'catalogue', (t, handle: string) => coreProduct(t, handle, false))
export async function shopProduct(tenantId: string, handle: string): Promise<Lookup> {
  return lookup(await shopHandles(tenantId), () => shopProductRow(tenantId, handle), handle)
}

export const previewShop = (tenantId: string) => coreShop(tenantId)
export const previewCatalogue = async (tenantId: string) => expand(await coreCatalogue(tenantId, true))
export async function previewProduct(tenantId: string, handle: string): Promise<Lookup> {
  return lookup(await coreHandles(tenantId, true), () => coreProduct(tenantId, handle, true), handle)
}
