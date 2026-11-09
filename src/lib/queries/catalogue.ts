import 'server-only'
import { costsVisibleIn } from './settings'
import type { MemberRole } from '@/domains/tenancy/roles'
import { cache } from 'react'
import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { availability, type WhenOut } from '@/domains/catalogue/availability'
import { matches, type ProductFacts, type Rule } from '@/domains/catalogue/collection-rules'
import { collectionProducts, collections, productAttributes, productColours, productHandleHistory, productImages, products, productTypes, variants } from '@/lib/db/schema-catalogue'
import { withTenant } from '@/lib/db/tenant'
import type { Tx } from '@/lib/db'
import { shopSettings, tenants } from '@/lib/db/schema'
import { productPairs } from '@/lib/db/schema-catalogue'
import { extrasOffered } from './look'

// The console's catalogue reads (1A). Every one inside withTenant with an
// explicit tenant where. These include the merchant's own unit cost: they are
// for the CONSOLE only — the storefront has its own queries that never select it.

/** The product list: one row each, with its cover, variant count, price range and stock. 50 a page. */
export async function listProducts(tenantId: string, page = 0, status: 'draft' | 'active' | 'unlisted' | 'archived' | null = null) {
  return withTenant(tenantId, (tx) =>
    tx.select({
      id: products.id, title: products.title, handle: products.handle, status: products.status, publishAt: products.publishAt, publishedAt: products.publishedAt, updatedAt: products.updatedAt,
      typeName: productTypes.name,
      variantCount: sql<number>`(select count(*)::int from ${variants} v where v.product_id = "products"."id" and v.tenant_id = ${tenantId} and v.archived_at is null)`,
      stock: sql<number>`(select coalesce(sum(v.stock), 0)::int from ${variants} v where v.product_id = "products"."id" and v.tenant_id = ${tenantId} and v.archived_at is null)`,
      minPrice: sql<number | null>`(select min(v.price)::bigint from ${variants} v where v.product_id = "products"."id" and v.tenant_id = ${tenantId} and v.archived_at is null)`,
      maxPrice: sql<number | null>`(select max(v.price)::bigint from ${variants} v where v.product_id = "products"."id" and v.tenant_id = ${tenantId} and v.archived_at is null)`,
      cover: sql<{ base: string; widths: number[] } | null>`(select json_build_object('base', i.base, 'widths', i.widths) from ${productImages} i where i.product_id = "products"."id" and i.tenant_id = ${tenantId} order by i.position limit 1)`,
    })
      .from(products)
      .leftJoin(productTypes, and(eq(productTypes.id, products.typeId), eq(productTypes.tenantId, tenantId)))
      .where(and(eq(products.tenantId, tenantId), status ? eq(products.status, status) : sql`${products.status} <> 'archived'`))
      .orderBy(desc(products.updatedAt))
      .limit(50).offset(page * 50),
  ).then((rows) => rows.map((r) => ({ ...r, minPrice: r.minPrice === null ? null : Number(r.minPrice), maxPrice: r.maxPrice === null ? null : Number(r.maxPrice) })))
}

export type ProductListRow = Awaited<ReturnType<typeof listProducts>>[number]

/** Every product's tax (Products › HSN codes): its code, unit, own rate and lowest price; the shop's GST facts. Up to 2,000. */
export async function productsTax(tenantId: string) {
  return withTenant(tenantId, async (tx) => {
    const [rows, [shop]] = await Promise.all([
      tx.select({ id: products.id, title: products.title, handle: products.handle, status: products.status, hsn: products.hsn, uqc: products.uqc, gstBps: products.gstBps, typeName: productTypes.name,
        minPrice: sql<number | null>`(select min(v.price)::bigint from ${variants} v where v.product_id = "products"."id" and v.tenant_id = ${tenantId} and v.archived_at is null)` })
        .from(products).leftJoin(productTypes, and(eq(productTypes.id, products.typeId), eq(productTypes.tenantId, tenantId)))
        .where(and(eq(products.tenantId, tenantId), sql`${products.status} <> 'archived'`)).orderBy(asc(products.title)).limit(2000),
      tx.select({ gstin: shopSettings.gstin, gstScheme: shopSettings.gstScheme, pricesIncludeGst: shopSettings.pricesIncludeGst, turnoverBand: shopSettings.turnoverBand }).from(shopSettings).where(eq(shopSettings.tenantId, tenantId)),
    ])
    return { rows: rows.map((r) => ({ ...r, minPrice: r.minPrice === null ? null : Number(r.minPrice) })), shop: shop ?? null }
  })
}

/** How many products have each status (the list's tabs). */
export async function statusCounts(tenantId: string): Promise<Record<string, number>> {
  const rows = await withTenant(tenantId, (tx) => tx.select({ status: products.status, n: count() }).from(products).where(eq(products.tenantId, tenantId)).groupBy(products.status))
  return Object.fromEntries(rows.map((r) => [r.status, r.n]))
}

export async function productCount(tenantId: string): Promise<number> {
  const [row] = await withTenant(tenantId, (tx) =>
    tx.select({ n: count() }).from(products).where(and(eq(products.tenantId, tenantId), isNull(products.archivedAt))))
  return row?.n ?? 0
}

/** A product's id from its handle (or an old handle, which the console then redirects). */
/** Cached for one request: the page and its tab title both ask (impact review U·2a). */
export const productIdByHandle = cache(async (tenantId: string, handle: string): Promise<{ id: string; handle: string; title: string } | null> => {
  return withTenant(tenantId, async (tx) => {
    const [p] = await tx.select({ id: products.id, handle: products.handle, title: products.title }).from(products).where(and(eq(products.tenantId, tenantId), eq(products.handle, handle))).limit(1)
    if (p) return p
    const [old] = await tx.select({ id: products.id, handle: products.handle, title: products.title }).from(productHandleHistory)
      .innerJoin(products, and(eq(products.id, productHandleHistory.productId), eq(products.tenantId, tenantId)))
      .where(and(eq(productHandleHistory.tenantId, tenantId), eq(productHandleHistory.handle, handle))).limit(1)
    return old ?? null
  })
})

export async function productHandleById(tenantId: string, id: string): Promise<string | null> {
  const [p] = await withTenant(tenantId, (tx) => tx.select({ handle: products.handle }).from(products).where(and(eq(products.tenantId, tenantId), eq(products.id, id))).limit(1))
  return p?.handle ?? null
}

/** Everything the editor needs for one product, in one transaction; null if it is not this shop's. */
/** The product editor's reads. `role`: the viewer's, for its cost of goods (`seesCosts`: owner 2026-11-08, hidden from
 * staff and from a partner after handover; not sent at all then). */
export async function productForEdit(tenantId: string, productId: string, role: MemberRole) {
  return withTenant(tenantId, async (tx) => {
    const [product] = await tx.select().from(products).where(and(eq(products.tenantId, tenantId), eq(products.id, productId))).limit(1)
    if (!product) return null
    const mine = <T extends { tenantId: unknown; productId: unknown }>(t: T) => and(eq(t.tenantId as never, tenantId), eq(t.productId as never, productId))
    const [vs0, imgs, types, colours, attrs, cols, member, costs, pairRows, offers] = await Promise.all([
      tx.select().from(variants).where(and(mine(variants), isNull(variants.archivedAt))).orderBy(asc(variants.position)),
      tx.select().from(productImages).where(mine(productImages)).orderBy(asc(productImages.position)),
      tx.select({
        id: productTypes.id, name: productTypes.name, sizeChart: productTypes.sizeChart,
        // Written out: in a one-table select drizzle prints ${productTypes.id} as a bare "id", which the subquery would read as p.id.
        uses: sql<number>`(select count(*)::int from ${products} p where p.type_id = "product_types"."id" and p.tenant_id = ${tenantId} and p.archived_at is null)`,
      }).from(productTypes).where(eq(productTypes.tenantId, tenantId)).orderBy(asc(productTypes.name)),
      tx.select().from(productColours).where(mine(productColours)),
      tx.select().from(productAttributes).where(mine(productAttributes)),
      tx.select({ id: collections.id, title: collections.title, kind: collections.kind, matchAll: collections.matchAll, rules: collections.rules }).from(collections).where(eq(collections.tenantId, tenantId)).orderBy(asc(collections.title)),
      tx.select({ collectionId: collectionProducts.collectionId }).from(collectionProducts).where(mine(collectionProducts)),
      costsVisibleIn(tx, tenantId, role),
      // Signal S3: its pairings (title and first photo for the card) and whether the look offers the cards.
      tx.select(pieceCols(tenantId))
        .from(productPairs).innerJoin(products, and(eq(products.tenantId, productPairs.tenantId), eq(products.id, productPairs.pairedId)))
        .leftJoin(productImages, and(eq(productImages.tenantId, products.tenantId), eq(productImages.productId, products.id), eq(productImages.position, 0)))
        .where(mine(productPairs)).orderBy(asc(productPairs.position)),
      extrasOffered(tx, tenantId),
    ])
    const vs = costs ? vs0 : vs0.map((v) => ({ ...v, unitCost: null }))
    const [shop] = await tx.select({ name: tenants.name, slug: tenants.slug, orderPrefix: shopSettings.orderPrefix, codOn: shopSettings.codOn, returnDays: shopSettings.returnDays, returnKind: shopSettings.returnKind, pickup: shopSettings.pickupPincode,
      gstin: shopSettings.gstin, gstScheme: shopSettings.gstScheme, turnoverBand: shopSettings.turnoverBand, pricesIncludeGst: shopSettings.pricesIncludeGst, sells: shopSettings.sells, legalName: shopSettings.legalName, legalAddress: shopSettings.address })
      .from(tenants).innerJoin(shopSettings, eq(shopSettings.tenantId, tenants.id)).where(eq(tenants.id, tenantId))
    return { product, variants: vs, images: imgs, types, colours, attributes: attrs, collections: cols, memberOf: member.map((m) => m.collectionId), shop: shop ?? null, costs,
      pairs: pairRows, offers: { stories: offers.stories || product.stories.length > 0, pairs: offers.pairs || pairRows.length > 0 } }
  })
}

export async function typesFor(tenantId: string) {
  return withTenant(tenantId, (tx) =>
    tx.select({ id: productTypes.id, name: productTypes.name }).from(productTypes).where(eq(productTypes.tenantId, tenantId)).orderBy(asc(productTypes.name)))
}

export type FactsRow = ProductFacts & { id: string; title: string; handle: string; status: string; cover: { base: string; widths: number[] } | null }

/** Every product's facts for collection rules (collection-rules.ts), in one transaction. */
/** Every product's facts for collection rules, in the caller's tenant transaction (placement reads them fresh). */
export async function productFactsIn(tx: Tx, tenantId: string, now = new Date()): Promise<FactsRow[]> {
    const ps = await tx.select({ id: products.id, title: products.title, handle: products.handle, status: products.status, categoryId: products.taxonomyCategory, tags: products.tags,
      cover: sql<{ base: string; widths: number[] } | null>`(select json_build_object('base', i.base, 'widths', i.widths) from ${productImages} i where i.product_id = "products"."id" and i.tenant_id = ${tenantId} order by i.position limit 1)` })
      .from(products).where(and(eq(products.tenantId, tenantId), sql`${products.status} <> 'archived'`)).orderBy(desc(products.updatedAt)).limit(2000)
    if (!ps.length) return []
    const [vs, attrs, cols] = await Promise.all([
      tx.select({ productId: variants.productId, price: variants.price, stock: variants.stock, whenOut: variants.whenOut, shipsBy: variants.shipsBy, leadMinDays: variants.leadMinDays, leadMaxDays: variants.leadMaxDays, preorderCap: variants.preorderCap })
        .from(variants).where(and(eq(variants.tenantId, tenantId), isNull(variants.archivedAt))),
      tx.select().from(productAttributes).where(eq(productAttributes.tenantId, tenantId)),
      tx.select({ productId: productColours.productId, family: productColours.family }).from(productColours).where(eq(productColours.tenantId, tenantId)),
    ])
    return ps.map((p) => {
      const mine = vs.filter((v) => v.productId === p.id)
      return {
        ...p,
        attributes: Object.fromEntries(attrs.filter((a) => a.productId === p.id).map((a) => [a.attribute, a.values])),
        colourFamilies: cols.filter((c) => c.productId === p.id && c.family).map((c) => c.family!),
        minPrice: mine.length ? Math.min(...mine.map((v) => Number(v.price))) : null,
        inStock: mine.some((v) => availability({ ...v, whenOut: v.whenOut as WhenOut }, now).canBuy),
      }
    })
}

export async function productFacts(tenantId: string, now = new Date()): Promise<FactsRow[]> {
  return withTenant(tenantId, (tx) => productFactsIn(tx, tenantId, now))
}

/** The collections list, each with how many products are in it now. */
export async function listCollections(tenantId: string) {
  const [cols, members, facts] = await Promise.all([
    withTenant(tenantId, (tx) => tx.select().from(collections).where(eq(collections.tenantId, tenantId)).orderBy(asc(collections.title))),
    withTenant(tenantId, (tx) => tx.select({ collectionId: collectionProducts.collectionId, n: count() }).from(collectionProducts).where(eq(collectionProducts.tenantId, tenantId)).groupBy(collectionProducts.collectionId)),
    productFacts(tenantId),
  ])
  return cols.map((c) => ({
    id: c.id, title: c.title, handle: c.handle, kind: c.kind as 'manual' | 'auto',
    count: c.kind === 'manual' ? members.find((m) => m.collectionId === c.id)?.n ?? 0 : facts.filter((f) => matches(c.rules as Rule[], c.matchAll === 1, f)).length,
  }))
}

/** One collection for its editor, with its hand-picked products in order. */
export async function collectionForEdit(tenantId: string, handle: string) {
  return withTenant(tenantId, async (tx) => {
    const [c] = await tx.select().from(collections).where(and(eq(collections.tenantId, tenantId), eq(collections.handle, handle))).limit(1)
    if (!c) return null
    const picked = await tx.select({ productId: collectionProducts.productId }).from(collectionProducts)
      .where(and(eq(collectionProducts.tenantId, tenantId), eq(collectionProducts.collectionId, c.id))).orderBy(asc(collectionProducts.position))
    return { ...c, productIds: picked.map((p) => p.productId) }
  })
}

/** Attribute values this shop's products actually use (what an automatic rule can match on). */
export async function usedAttributeValues(tenantId: string) {
  const rows = await withTenant(tenantId, (tx) => tx.selectDistinct({ attribute: productAttributes.attribute, values: productAttributes.values }).from(productAttributes).where(eq(productAttributes.tenantId, tenantId)))
  const out = new Map<string, Set<string>>()
  for (const r of rows) for (const v of r.values) (out.get(r.attribute) ?? out.set(r.attribute, new Set()).get(r.attribute)!).add(v)
  return [...out].map(([attribute, vals]) => ({ attribute, values: [...vals] }))
}

export async function productsByIds(tenantId: string, ids: string[]) {
  if (!ids.length) return []
  return withTenant(tenantId, (tx) => tx.select({ id: products.id, title: products.title }).from(products).where(and(eq(products.tenantId, tenantId), inArray(products.id, ids))))
}

/** Signal S3, "Pair it with": up to 8 of this shop's pieces whose title matches (listed or unlisted; never this product).
 *  ILIKE on the title is fine at today's catalogue sizes (plan P10). */
export async function searchPieces(tenantId: string, productId: string, q: string) {
  const term = q.trim().slice(0, 60)
  if (!term) return []
  const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
  return withTenant(tenantId, (tx) => tx.select(pieceCols(tenantId))
    .from(products).leftJoin(productImages, and(eq(productImages.tenantId, products.tenantId), eq(productImages.productId, products.id), eq(productImages.position, 0)))
    .where(and(eq(products.tenantId, tenantId), sql`${products.id} <> ${productId}`, inArray(products.status, ['active', 'unlisted']), sql`${products.title} ilike ${like}`))
    .orderBy(asc(products.title)).limit(8))
}

/** A piece as the "Pair it with" card shows it: cover, lowest price, how many sizes, whether any can be bought now
 *  (stock, or pre-order / made to order: the editor's hint; the shop decides with availability()). */
const pieceCols = (tenantId: string) => ({
  id: products.id, title: products.title, status: products.status, base: productImages.base, widths: productImages.widths,
  price: sql<number | null>`(select min(v.price)::float8 from ${variants} v where v.tenant_id = ${tenantId} and v.product_id = "products"."id" and v.archived_at is null)`,
  sizes: sql<number>`(select count(*)::int from ${variants} v where v.tenant_id = ${tenantId} and v.product_id = "products"."id" and v.archived_at is null)`,
  buyable: sql<boolean>`coalesce((select bool_or(v.stock > 0 or v.when_out <> 'stop') from ${variants} v where v.tenant_id = ${tenantId} and v.product_id = "products"."id" and v.archived_at is null), false)`,
})
export type { Piece } from '@/domains/catalogue/stories'
