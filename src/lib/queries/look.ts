import 'server-only'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { products } from '@/lib/db/schema-catalogue'
import { withTenant } from '@/lib/db/tenant'
import { lookFacts } from '@/lib/themes/facts'
import { lookFor, revisionOf, type Look, type Revision } from '@/lib/themes/look'
import type { ShopFacts } from '@/domains/themes/readiness'
import { collections } from '@/lib/db/schema-catalogue'

// Console › Look's reads, each in the member's own shop's transaction (src/lib/themes/look.ts holds the rules).

export const lookPage = (tenantId: string): Promise<Look & { facts: ShopFacts & { accent: string; displayFont: string; sells: string[] } }> =>
  withTenant(tenantId, async (tx) => ({ ...(await lookFor(tx, tenantId)), facts: await lookFacts(tx, tenantId) }))

export type EditorData = {
  draft: Revision; live: Revision | null; facts: ShopFacts & { accent: string; displayFont: string; sells: string[] }
  collections: { handle: string; title: string }[]; products: { handle: string; title: string }[]
}

/** The customizer's data: the open draft (null: there is none to edit), the live look for the change list, link targets. */
export async function editorData(tenantId: string): Promise<EditorData | null> {
  return withTenant(tenantId, async (tx) => {
    const l = await lookFor(tx, tenantId)
    if (!l.draft) return null
    const [facts, cols, prods] = await Promise.all([
      lookFacts(tx, tenantId),
      tx.select({ handle: collections.handle, title: collections.title }).from(collections).where(eq(collections.tenantId, tenantId)).orderBy(asc(collections.title)).limit(200),
      tx.select({ handle: products.handle, title: products.title }).from(products).where(and(eq(products.tenantId, tenantId), eq(products.status, 'active'))).orderBy(desc(sql`coalesce(${products.publishAt}, ${products.publishedAt}, ${products.createdAt})`)).limit(60),
    ])
    return { draft: l.draft, live: l.live?.revision ?? null, facts, collections: cols, products: prods }
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
