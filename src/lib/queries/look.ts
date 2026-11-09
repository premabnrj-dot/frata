import 'server-only'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { productImages, products } from '@/lib/db/schema-catalogue'
import { withTenant } from '@/lib/db/tenant'
import { lookFacts } from '@/lib/themes/facts'
import { liveRevision, lookFor, openDraft, revisionOf, type Look, type Revision } from '@/lib/themes/look'
import { manifestNear } from '@/domains/themes/catalogue'
import type { Tx } from '@/lib/db'
import type { ShopFacts } from '@/domains/themes/readiness'
import { collections } from '@/lib/db/schema-catalogue'

// Console › Look's reads, each in the member's own shop's transaction (src/lib/themes/look.ts holds the rules).

export const lookPage = (tenantId: string): Promise<Look & { facts: ShopFacts & { accent: string; displayFont: string; sells: string[] } }> =>
  withTenant(tenantId, async (tx) => ({ ...(await lookFor(tx, tenantId)), facts: await lookFacts(tx, tenantId) }))

export type EditorData = {
  draft: Revision; live: Revision | null; facts: ShopFacts & { accent: string; displayFont: string; sells: string[] }
  collections: { handle: string; title: string }[]; products: { handle: string; title: string }[]
  photos: { base: string; widths: number[]; width: number; height: number; alt: string; title: string }[]
}

/** The customizer's data: the open draft (null: there is none to edit), the live look for the change list, link targets. */
export async function editorData(tenantId: string): Promise<EditorData | null> {
  return withTenant(tenantId, async (tx) => {
    const l = await lookFor(tx, tenantId)
    if (!l.draft) return null
    const [facts, cols, prods, photos] = await Promise.all([
      lookFacts(tx, tenantId),
      tx.select({ handle: collections.handle, title: collections.title }).from(collections).where(eq(collections.tenantId, tenantId)).orderBy(asc(collections.title)).limit(200),
      tx.select({ handle: products.handle, title: products.title }).from(products).where(and(eq(products.tenantId, tenantId), eq(products.status, 'active'))).orderBy(desc(sql`coalesce(${products.publishAt}, ${products.publishedAt}, ${products.createdAt})`)).limit(60),
      // Look v3: the shop's own product photos (each product's first), for "From your products" in a photo field.
      tx.select({ base: productImages.base, widths: productImages.widths, width: productImages.width, height: productImages.height, alt: productImages.alt, title: products.title })
        .from(productImages).innerJoin(products, and(eq(products.id, productImages.productId), eq(products.tenantId, productImages.tenantId)))
        .where(and(eq(productImages.tenantId, tenantId), eq(productImages.position, 0), eq(products.status, 'active'))).orderBy(desc(productImages.createdAt)).limit(24),
    ])
    return { draft: l.draft, live: l.live?.revision ?? null, facts, collections: cols, products: prods, photos }
  })
}

export const revisionFor = (tenantId: string, id: string) => withTenant(tenantId, (tx) => revisionOf(tx, tenantId, id))

/**
 * The live look, when THIS person published it in the last 10 minutes (and so the Published page after Publish
 * applies), else null: after Discard, a bookmark or someone else's publish, the customizer sends them to Look.
 */
export async function justPublished(tenantId: string, userId: string, now: Date): Promise<{ liveId: string; canUndo: boolean } | null> {
  return withTenant(tenantId, async (tx) => {
    const l = await lookFor(tx, tenantId)
    if (!l.live || l.live.publishedBy !== userId || now.getTime() - l.live.publishedAt.getTime() > 10 * 60_000) return null
    return { liveId: l.live.revision.id, canUndo: !!l.previous }
  })
}

/** Signal S3: does the live or the draft look offer product stories / "Pair it with"? (The product editor shows its
 *  cards then, or when the product already has some, so they can always be removed.) Inside the caller's transaction. */
export async function extrasOffered(tx: Tx, tenantId: string): Promise<{ stories: boolean; pairs: boolean }> {
  const revs = await Promise.all([liveRevision(tx, tenantId), openDraft(tx, tenantId)])
  const allowed = revs.map((r) => (r ? manifestNear(r.themeKey, r.themeVersion)?.allowed : undefined))
  return { stories: allowed.some((a) => !!a?.productStories), pairs: allowed.some((a) => !!a?.pairWith) }
}
