import 'server-only'
import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import { revalidateTag, unstable_cache } from 'next/cache'
import { LOW_STOCK_AT } from '@/domains/catalogue/availability'
import type { Chart } from '@/domains/catalogue/size-charts'
import type { PolicyFacts } from '@/domains/policies/render'
import type { DeliveryRules } from '@/domains/checkout/delivery'
import { tenantForHost } from '@/lib/db/platform'
import { shopPolicies, shopSettings, tenants } from '@/lib/db/schema'
import { collectionProducts, collections, productAttributes, productColours, productHandleHistory, productImages, products, productTypes, variants } from '@/lib/db/schema-catalogue'
import { owedSql, stateSql } from '@/lib/db/order-predicates'
import { orderLines, orders } from '@/lib/db/schema-orders'
import { liveRevision, revisionOf, type Revision } from '@/lib/themes/look'
import { withTenant } from '@/lib/db/tenant'
import { discountCodes, discounts } from '@/lib/db/schema-discounts'
import { SHOP_DOMAIN } from '@/lib/public-env'

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
function shopCached<A extends (string | number)[], R>(name: string, scope: 'shop' | 'catalogue', fn: Loader<A, R>, revalidate = 60): Loader<A, R> {
  return (tenantId, ...a) => unstable_cache(() => fn(tenantId, ...a), ['sf', name, tenantId, ...a.map(String)], {
    tags: [`shop:${tenantId}`, ...(scope === 'catalogue' ? [`shop:${tenantId}:catalogue`] : [])], revalidate,
  })()
}

/** After a console write commits: the shop's pages read fresh rows. */
export function refreshShop(tenantId: string, scope: 'shop' | 'catalogue') {
  revalidateTag(scope === 'shop' ? `shop:${tenantId}` : `shop:${tenantId}:catalogue`)
}
/** After an address change or a new shop: the host lookups for both addresses. */
export function refreshHosts(...hosts: string[]) {
  for (const h of hosts) revalidateTag(`host:${h}`)
}
export const hostFor = (slug: string) => `${slug}.${SHOP_DOMAIN}`

class Miss extends Error {}
/** Which shop a host is. A miss is never cached (anyone can mint subdomains); a hit lives 60 s or until its tag. */
export async function shopIdForHost(host: string): Promise<string | null> {
  try {
    return await unstable_cache(async () => { const t = await tenantForHost(host); if (!t) throw new Miss(); return t.id }, ['sf-host', host], { tags: [`host:${host}`], revalidate: 60 })()
  } catch (e) {
    if (e instanceof Miss) return null
    throw e
  }
}

// ── The shop ───────────────────────────────────────────────────────────────────

export type StoreShop = PolicyFacts & DeliveryRules & {
  id: string; slug: string; host: string; publishedAt: string | null; orderPrefix: string
  accent: string; displayFont: string; tagline: string; logoUrl: string | null; whatsapp: string; instagram: string
  overrides: Record<string, string>; nav: { handle: string; title: string }[]
}

async function coreShop(tenantId: string): Promise<StoreShop | null> {
  return withTenant(tenantId, async (tx) => {
    const [r] = await tx.select({
      name: tenants.name, slug: tenants.slug, publishedAt: shopSettings.publishedAt, orderPrefix: shopSettings.orderPrefix,
      legalName: shopSettings.legalName, address: shopSettings.address, supportEmail: shopSettings.supportEmail, supportPhone: shopSettings.supportPhone,
      whatsapp: shopSettings.whatsapp, instagram: shopSettings.instagram,
      grievanceName: shopSettings.grievanceName, grievanceRole: shopSettings.grievanceRole, grievanceEmail: shopSettings.grievanceEmail, grievancePhone: shopSettings.grievancePhone,
      accent: shopSettings.accent, displayFont: shopSettings.displayFont, tagline: shopSettings.tagline, logoUrl: shopSettings.logoUrl,
      returnKind: shopSettings.returnKind, returnDays: shopSettings.returnDays,
      // COD limits are public: the Shipping policy states them.
      codOn: shopSettings.codOn, codMin: shopSettings.codMin, codMax: shopSettings.codMax, codCharge: shopSettings.codCharge,
      shippingFlat: shopSettings.shippingFlat, freeShippingAbove: shopSettings.freeShippingAbove,
      dispatchDays: shopSettings.dispatchDays, metroDays: shopSettings.metroDays, restDays: shopSettings.restDays, pricesIncludeGst: shopSettings.pricesIncludeGst,
    }).from(tenants).innerJoin(shopSettings, eq(shopSettings.tenantId, tenants.id)).where(eq(tenants.id, tenantId)).limit(1)
    if (!r) return null
    const [pol, nav] = await Promise.all([
      tx.select({ kind: shopPolicies.kind, body: shopPolicies.body }).from(shopPolicies).where(eq(shopPolicies.tenantId, tenantId)),
      // The header's collections: the first five by name (spec § Review findings).
      tx.select({ handle: collections.handle, title: collections.title }).from(collections).where(eq(collections.tenantId, tenantId)).orderBy(asc(collections.title)).limit(5),
    ])
    return {
      ...r, shopName: r.name, id: tenantId, host: hostFor(r.slug), publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
      returnKind: r.returnKind as PolicyFacts['returnKind'],
      codMin: Number(r.codMin), codMax: Number(r.codMax), codCharge: Number(r.codCharge), shippingFlat: Number(r.shippingFlat), freeShippingAbove: Number(r.freeShippingAbove),
      overrides: Object.fromEntries(pol.map((p) => [p.kind, p.body])), nav,
    }
  })
}

// ── The catalogue: every product a list can show, and the collections ───────────

export type StoreImage = { id: string; base: string; widths: number[]; width: number; height: number; optionValue: string | null; alt: string }
export type StoreVariant = { id: string; values: string[]; sku: string | null; price: number; compareAt: number | null; stock: number; whenOut: 'stop' | 'preorder' | 'made_to_order'; shipsBy: string | null; leadMinDays: number | null; leadMaxDays: number | null; preorderFull: boolean; restockedAt: string | null }
export type StoreColour = { value: string; family: string | null; hex: string | null; cropImageId: string | null; crop: { x: number; y: number; r: number } | null }
export type StoreCard = {
  id: string; handle: string; title: string; status: string; publishAt: string | null; since: string
  options: string[]; images: StoreImage[]; variants: StoreVariant[]; colours: StoreColour[]
  categoryId: string | null; attributes: Record<string, string[]>; tags: string[]
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
  id: variants.id, productId: variants.productId, values: variants.optionValues, sku: variants.sku, price: variants.price, compareAt: variants.compareAt,
  stock: variants.stock, whenOut: variants.whenOut, shipsBy: variants.shipsBy, leadMinDays: variants.leadMinDays, leadMaxDays: variants.leadMaxDays, cap: variants.preorderCap,
  restockedAt: variants.restockedAt,
})
const imageCols = { id: productImages.id, productId: productImages.productId, base: productImages.base, widths: productImages.widths, width: productImages.width, height: productImages.height, optionValue: productImages.optionValue, alt: productImages.alt }
const colourCols = { productId: productColours.productId, value: productColours.value, family: productColours.family, hex: productColours.hex, cropImageId: productColours.cropImageId, crop: productColours.crop }

const toVariant = (v: { id: string; values: string[]; sku: string | null; price: number; compareAt: number | null; stock: number; owed: number; whenOut: string; shipsBy: string | null; leadMinDays: number | null; leadMaxDays: number | null; cap: number | null; restockedAt: Date | null }): StoreVariant => ({
  id: v.id, values: v.values, sku: v.sku, price: Number(v.price), compareAt: v.compareAt === null ? null : Number(v.compareAt),
  // Shoppers learn "only N left" at LOW_STOCK_AT or below; above it, the count is not theirs to see.
  stock: Math.min(Math.max(0, v.stock - v.owed), LOW_STOCK_AT + 1), whenOut: v.whenOut as StoreVariant['whenOut'], shipsBy: v.shipsBy, leadMinDays: v.leadMinDays, leadMaxDays: v.leadMaxDays,
  // No orders before 1C, so pre-orders are full only at a cap of 0; 1C counts them.
  preorderFull: v.cap !== null && v.cap <= 0,
  restockedAt: v.restockedAt ? v.restockedAt.toISOString() : null,
})

async function coreCatalogue(tenantId: string, drafts: boolean): Promise<StoreCatalogue> {
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
    return {
      products: ps.map((p) => ({
        id: p.id, handle: p.handle, title: p.title, status: p.status, publishAt: p.publishAt ? p.publishAt.toISOString() : null, since: new Date(p.since).toISOString(), options: p.options,
        categoryId: p.categoryId, tags: p.tags,
        // Lists show two photos at most (cover, and the second on hover) plus each colour's own first photo.
        images: imgs.filter((i) => i.productId === p.id).map(({ productId: _, ...i }) => i),
        variants: vs.filter((v) => v.productId === p.id).map(toVariant),
        colours: cols.filter((c) => c.productId === p.id).map(({ productId: _, ...c }) => c),
        attributes: Object.fromEntries(attrs.filter((a) => a.productId === p.id).map((a) => [a.attribute, a.values])),
      })),
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

// Which revision is live, and which revision an id names, are src/lib/themes/look.ts's rules; read through it.
const coreLook = (tenantId: string) => withTenant(tenantId, async (tx) => stored(await liveRevision(tx, tenantId)))

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

export const shopLook = shopCached('look', 'shop', (t) => coreLook(t))
export const shopBestSellers = shopCached('best', 'catalogue', (t, days: number) => coreBestSellers(t, days), 3600)
export const previewLook = (tenantId: string) => coreLook(tenantId)
export const previewBestSellers = (tenantId: string, days: number) => coreBestSellers(tenantId, days)

export const shopSettingsFor = shopCached('shop', 'shop', (t) => coreShop(t))

/**
 * The offer in the shop's announcement bar (one at most), as RAW terms and timestamps: whether it is live is decided
 * when the page renders (offerStatus) — pages regenerate every 60 s, so up to a minute late. Shopper-safe fields only — never a limit, budget or count (ADR-0003).
 */
export const shopAnnouncement = shopCached('announce', 'shop', (tenantId) => withTenant(tenantId, async (tx) => {
  const [r] = await tx.select({
    title: discounts.title, style: discounts.style, percentBps: discounts.percentBps, amountOff: discounts.amountOff, minSubtotal: discounts.minSubtotal, listed: discounts.listed,
    startsAt: discounts.startsAt, endsAt: discounts.endsAt, startedAt: discounts.startedAt, pausedAt: discounts.pausedAt, endedAt: discounts.endedAt, code: discountCodes.code,
  }).from(discounts).leftJoin(discountCodes, and(eq(discountCodes.tenantId, discounts.tenantId), eq(discountCodes.discountId, discounts.id)))
    .where(and(eq(discounts.tenantId, tenantId), eq(discounts.announce, true))).limit(1)
  if (!r) return null
  const iso = (d: Date | null) => (d ? d.toISOString() : null)
  return { title: r.title, style: r.style, percentBps: r.percentBps, amountOff: r.amountOff === null ? null : Number(r.amountOff), minSubtotal: Number(r.minSubtotal),
    code: r.listed && r.code ? r.code.toUpperCase() : null, startsAt: r.startsAt.toISOString(), endsAt: iso(r.endsAt), startedAt: iso(r.startedAt), pausedAt: iso(r.pausedAt), endedAt: iso(r.endedAt) }
}))
export const shopCatalogue = shopCached('catalogue', 'catalogue', (t) => coreCatalogue(t, false))
const shopHandles = shopCached('handles', 'catalogue', (t) => coreHandles(t, false))
const shopProductRow = shopCached('product', 'catalogue', (t, handle: string) => coreProduct(t, handle, false))
export async function shopProduct(tenantId: string, handle: string): Promise<Lookup> {
  return lookup(await shopHandles(tenantId), () => shopProductRow(tenantId, handle), handle)
}

export const previewShop = (tenantId: string) => coreShop(tenantId)
export const previewCatalogue = (tenantId: string) => coreCatalogue(tenantId, true)
export async function previewProduct(tenantId: string, handle: string): Promise<Lookup> {
  return lookup(await coreHandles(tenantId, true), () => coreProduct(tenantId, handle, true), handle)
}
