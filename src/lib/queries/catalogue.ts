import 'server-only'
import { and, asc, count, desc, eq, isNull, sql } from 'drizzle-orm'
import { productImages, products, productTypes, variants } from '@/lib/db/schema-catalogue'
import { withTenant } from '@/lib/db/tenant'
import { shopSettings, tenants } from '@/lib/db/schema'

// The console's catalogue reads (1A). Every one inside withTenant with an
// explicit tenant where. These include the merchant's own unit cost: they are
// for the CONSOLE only — the storefront has its own queries that never select it.

/** The product list: one row each, with its cover, variant count, price range and stock. 50 a page. */
export async function listProducts(tenantId: string, page = 0) {
  return withTenant(tenantId, (tx) =>
    tx.select({
      id: products.id, title: products.title, handle: products.handle, publishedAt: products.publishedAt, updatedAt: products.updatedAt,
      typeName: productTypes.name,
      variantCount: sql<number>`(select count(*)::int from ${variants} v where v.product_id = "products"."id" and v.tenant_id = ${tenantId} and v.archived_at is null)`,
      stock: sql<number>`(select coalesce(sum(v.stock), 0)::int from ${variants} v where v.product_id = "products"."id" and v.tenant_id = ${tenantId} and v.archived_at is null)`,
      minPrice: sql<number | null>`(select min(v.price)::bigint from ${variants} v where v.product_id = "products"."id" and v.tenant_id = ${tenantId} and v.archived_at is null)`,
      maxPrice: sql<number | null>`(select max(v.price)::bigint from ${variants} v where v.product_id = "products"."id" and v.tenant_id = ${tenantId} and v.archived_at is null)`,
      cover: sql<{ base: string; widths: number[] } | null>`(select json_build_object('base', i.base, 'widths', i.widths) from ${productImages} i where i.product_id = "products"."id" and i.tenant_id = ${tenantId} order by i.position limit 1)`,
    })
      .from(products)
      .leftJoin(productTypes, and(eq(productTypes.id, products.typeId), eq(productTypes.tenantId, tenantId)))
      .where(and(eq(products.tenantId, tenantId), isNull(products.archivedAt)))
      .orderBy(desc(products.updatedAt))
      .limit(50).offset(page * 50),
  ).then((rows) => rows.map((r) => ({ ...r, minPrice: r.minPrice === null ? null : Number(r.minPrice), maxPrice: r.maxPrice === null ? null : Number(r.maxPrice) })))
}

export type ProductListRow = Awaited<ReturnType<typeof listProducts>>[number]

export async function productCount(tenantId: string): Promise<number> {
  const [row] = await withTenant(tenantId, (tx) =>
    tx.select({ n: count() }).from(products).where(and(eq(products.tenantId, tenantId), isNull(products.archivedAt))))
  return row?.n ?? 0
}

/** Everything the editor needs for one product, in one transaction; null if it is not this shop's. */
export async function productForEdit(tenantId: string, productId: string) {
  return withTenant(tenantId, async (tx) => {
    const [product] = await tx.select().from(products).where(and(eq(products.tenantId, tenantId), eq(products.id, productId))).limit(1)
    if (!product) return null
    const [vs, imgs, types] = await Promise.all([
      tx.select().from(variants).where(and(eq(variants.tenantId, tenantId), eq(variants.productId, productId), isNull(variants.archivedAt))).orderBy(asc(variants.position)),
      tx.select().from(productImages).where(and(eq(productImages.tenantId, tenantId), eq(productImages.productId, productId))).orderBy(asc(productImages.position)),
      tx.select({
        id: productTypes.id, name: productTypes.name, sizeChart: productTypes.sizeChart,
        // Written out: in a one-table select drizzle prints ${productTypes.id} as a bare "id", which the subquery would read as p.id.
        uses: sql<number>`(select count(*)::int from ${products} p where p.type_id = "product_types"."id" and p.tenant_id = ${tenantId} and p.archived_at is null)`,
      }).from(productTypes).where(eq(productTypes.tenantId, tenantId)).orderBy(asc(productTypes.name)),
    ])
    const [shop] = await tx.select({ name: tenants.name, slug: tenants.slug, orderPrefix: shopSettings.orderPrefix }).from(tenants)
      .innerJoin(shopSettings, eq(shopSettings.tenantId, tenants.id)).where(eq(tenants.id, tenantId))
    return { product, variants: vs, images: imgs, types, shop: shop ?? { name: '', slug: '', orderPrefix: '' } }
  })
}

export async function typesFor(tenantId: string) {
  return withTenant(tenantId, (tx) =>
    tx.select({ id: productTypes.id, name: productTypes.name }).from(productTypes).where(eq(productTypes.tenantId, tenantId)).orderBy(asc(productTypes.name)))
}
