import 'server-only'
import { and, asc, eq, isNotNull, isNull, ne, sql } from 'drizzle-orm'
import type { PhotoTarget } from '@/domains/catalogue/import/photos'
import { isColourOption } from '@/domains/storefront/picker'
import { productImages, products, variants } from '@/lib/db/schema-catalogue'
import { withTenant } from '@/lib/db/tenant'

// =============================================================================
// FILE: src/lib/queries/photos.ts
//
// THE PHOTOS PAGE'S READ (product import PI·2): every product of the shop that is not archived, with what its photos
// are matched by — its address, its name, its sizes' SKUs (and each size's colour), its colours — and how many photos
// it has. One read per table, in one snapshot. No price, no stock, no cost.
// =============================================================================

/** As many products as the Products › HSN codes list reads. */
const MAX_TARGETS = 2000

export async function photoTargets(tenantId: string): Promise<PhotoTarget[]> {
  return withTenant(tenantId, async (tx) => {
    const [rows, sizes, counts] = await Promise.all([
      tx.select({ id: products.id, title: products.title, handle: products.handle, options: products.options, optionValues: products.optionValues }).from(products)
        .where(and(eq(products.tenantId, tenantId), ne(products.status, 'archived'))).orderBy(asc(products.title)).limit(MAX_TARGETS),
      tx.select({ productId: variants.productId, sku: variants.sku, values: variants.optionValues }).from(variants)
        .where(and(eq(variants.tenantId, tenantId), isNull(variants.archivedAt), isNotNull(variants.sku))).orderBy(asc(variants.position)),
      tx.select({ productId: productImages.productId, n: sql<number>`count(*)::int` }).from(productImages)
        .where(eq(productImages.tenantId, tenantId)).groupBy(productImages.productId),
    ])
    const have = new Map(counts.map((c) => [c.productId, c.n]))
    const skus = new Map<string, { sku: string; values: string[] }[]>()
    for (const s of sizes) if (s.sku) skus.set(s.productId, [...(skus.get(s.productId) ?? []), { sku: s.sku, values: s.values }])
    return rows.map((p) => {
      const at = p.options.findIndex(isColourOption)
      return {
        id: p.id, title: p.title, handle: p.handle, photos: have.get(p.id) ?? 0,
        colours: at >= 0 ? (p.optionValues[at] ?? []) : [],
        skus: (skus.get(p.id) ?? []).map((s) => ({ sku: s.sku, colour: at >= 0 ? s.values[at] ?? null : null })),
      }
    })
  }, { snapshot: true })
}
