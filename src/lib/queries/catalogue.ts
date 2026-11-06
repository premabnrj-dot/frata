import 'server-only'
import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { availability, type WhenOut } from '@/domains/catalogue/availability'
import { matches, type ProductFacts, type Rule } from '@/domains/catalogue/collection-rules'
import { collectionProducts, collections, productAttributes, productColours, productHandleHistory, productImages, products, productTypes, variants } from '@/lib/db/schema-catalogue'
import { withTenant } from '@/lib/db/tenant'
import { shopSettings, tenants } from '@/lib/db/schema'

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
export async function productIdByHandle(tenantId: string, handle: string): Promise<{ id: string; handle: string } | null> {
  return withTenant(tenantId, async (tx) => {
    const [p] = await tx.select({ id: products.id, handle: products.handle }).from(products).where(and(eq(products.tenantId, tenantId), eq(products.handle, handle))).limit(1)
    if (p) return p
    const [old] = await tx.select({ id: products.id, handle: products.handle }).from(productHandleHistory)
      .innerJoin(products, and(eq(products.id, productHandleHistory.productId), eq(products.tenantId, tenantId)))
      .where(and(eq(productHandleHistory.tenantId, tenantId), eq(productHandleHistory.handle, handle))).limit(1)
    return old ?? null
  })
}

export async function productHandleById(tenantId: string, id: string): Promise<string | null> {
  const [p] = await withTenant(tenantId, (tx) => tx.select({ handle: products.handle }).from(products).where(and(eq(products.tenantId, tenantId), eq(products.id, id))).limit(1))
  return p?.handle ?? null
}

/** Everything the editor needs for one product, in one transaction; null if it is not this shop's. */
export async function productForEdit(tenantId: string, productId: string) {
  return withTenant(tenantId, async (tx) => {
    const [product] = await tx.select().from(products).where(and(eq(products.tenantId, tenantId), eq(products.id, productId))).limit(1)
    if (!product) return null
    const mine = <T extends { tenantId: unknown; productId: unknown }>(t: T) => and(eq(t.tenantId as never, tenantId), eq(t.productId as never, productId))
    const [vs, imgs, types, colours, attrs, cols, member] = await Promise.all([
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
    ])
    const [shop] = await tx.select({ name: tenants.name, slug: tenants.slug, orderPrefix: shopSettings.orderPrefix, codOn: shopSettings.codOn, returnDays: shopSettings.returnDays, returnKind: shopSettings.returnKind, pickup: shopSettings.pickupPincode })
      .from(tenants).innerJoin(shopSettings, eq(shopSettings.tenantId, tenants.id)).where(eq(tenants.id, tenantId))
    return { product, variants: vs, images: imgs, types, colours, attributes: attrs, collections: cols, memberOf: member.map((m) => m.collectionId), shop: shop ?? null }
  })
}

export async function typesFor(tenantId: string) {
  return withTenant(tenantId, (tx) =>
    tx.select({ id: productTypes.id, name: productTypes.name }).from(productTypes).where(eq(productTypes.tenantId, tenantId)).orderBy(asc(productTypes.name)))
}

export type FactsRow = ProductFacts & { id: string; title: string; handle: string; status: string; cover: { base: string; widths: number[] } | null }

/** Every product's facts for collection rules (collection-rules.ts), in one transaction. */
export async function productFacts(tenantId: string, now = new Date()): Promise<FactsRow[]> {
  return withTenant(tenantId, async (tx) => {
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
  })
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
