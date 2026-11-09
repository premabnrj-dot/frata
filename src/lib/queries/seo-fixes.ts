import 'server-only'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { FixFacts } from '@/domains/seo/fixes'
import { collections, productImages, products } from '@/lib/db/schema-catalogue'
import { shopSettings } from '@/lib/db/schema'
import { withTenant } from '@/lib/db/tenant'

const LIVE = ['active', 'unlisted'] as const

/** What the Search and sharing page counts (S·3), for live products only; three narrow reads in one transaction. */
export async function seoFixFacts(tenantId: string): Promise<FixFacts> {
  return withTenant(tenantId, async (tx) => {
    const [alt, intro, same] = await Promise.all([
      tx.select({ n: sql<number>`count(*)::int`, first: sql<string | null>`min(${products.handle})` }).from(productImages)
        .innerJoin(products, and(eq(products.id, productImages.productId), eq(products.tenantId, tenantId)))
        .where(and(eq(productImages.tenantId, tenantId), eq(productImages.alt, ''), inArray(products.status, [...LIVE]))),
      tx.select({ n: sql<number>`count(*)::int`, first: sql<string | null>`min(${collections.handle})` }).from(collections)
        .where(and(eq(collections.tenantId, tenantId), sql`btrim(${collections.description}) = ''`)),
      tx.select({ handle: products.handle }).from(products)
        .where(and(eq(products.tenantId, tenantId), inArray(products.status, [...LIVE]), sql`lower(${products.title}) in (
          select lower(p2.title) from products p2 where p2.tenant_id = ${tenantId} and p2.status in ('active','unlisted') group by lower(p2.title) having count(*) > 1)`))
        .orderBy(asc(products.handle)),
    ])
    return {
      photosNoAlt: { count: alt[0]?.n ?? 0, firstHandle: alt[0]?.first ?? null },
      collectionsNoIntro: { count: intro[0]?.n ?? 0, firstHandle: intro[0]?.first ?? null },
      sameTitle: { count: same.length, firstHandle: same[0]?.handle ?? null },
    }
  })
}

/** Home on Google: what the page form starts from. */
export async function homeSeoFacts(tenantId: string) {
  return withTenant(tenantId, async (tx) => {
    const [s] = await tx.select({ seoTitle: shopSettings.seoTitle, seoDescription: shopSettings.seoDescription }).from(shopSettings).where(eq(shopSettings.tenantId, tenantId))
    return s ?? { seoTitle: '', seoDescription: '' }
  })
}
