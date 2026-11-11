import 'server-only'
import { cache } from 'react'
import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import { withTenant } from '@/lib/db/tenant'
import { shopPages as pagesTable } from '@/lib/db/schema-themes'
import { canon, draftOf, targetOf, type LivePage } from '@/lib/themes/pages'
import type { PageDraft } from '@/domains/pages/templates'
import type { PageTemplate } from '@/domains/pages/templates'
import { shopCached } from './storefront'

// =============================================================================
// FILE: src/lib/queries/pages.ts — a shop's pages (Theme Studio TS1a). The shop reads only LIVE pages, cached per shop
// (tag shop:<t>:pages; Publish and Undo purge it with the look; never a draft in the shared cache: tenancy review).
// The console's previews read drafts uncached (previewPages), behind requireMember.
// =============================================================================

export type ShopPage = LivePage & { id: string; template: PageTemplate }

/** The shop's live pages (≤ 20, ≤ 64 kB of words: the publish checks). Read by the page route and the sitemap. */
export const shopPages = shopCached('pages-v1', 'pages', (tenantId: string) => withTenant(tenantId, async (tx) => {
  const rows = await tx.select({ id: pagesTable.id, template: pagesTable.template, live: pagesTable.live }).from(pagesTable)
    .where(and(eq(pagesTable.tenantId, tenantId), isNotNull(pagesTable.live), isNull(pagesTable.removedAt))).orderBy(pagesTable.createdAt)
  return rows.map((r) => ({ id: r.id, template: r.template as PageTemplate, ...(r.live as LivePage) }))
}), 86_400)

/** One live page by its address (a Map lookup over the cached list: no query, no inherited keys). */
export const shopPageAt = async (tenantId: string, handle: string): Promise<ShopPage | null> =>
  new Map((await shopPages(tenantId)).map((p) => [p.handle, p])).get(handle) ?? null

/** The customizer's and /console/preview's pages: each draft as it stands (hidden and unpublished included), uncached. */
export const previewPages = cache((tenantId: string) => withTenant(tenantId, async (tx) => {
  const rows = await tx.select().from(pagesTable).where(and(eq(pagesTable.tenantId, tenantId), isNull(pagesTable.removedAt))).orderBy(pagesTable.createdAt)
  return rows.flatMap((r) => { const d = draftOf(r); return d && !d.removed ? [{ id: r.id, template: r.template as PageTemplate, title: d.title, handle: d.handle, fill: d.fill, hidden: d.hidden }] : [] })
}))

/** A page as the customizer edits it: its draft and version, whether its address is fixed (it has been live), and
 *  whether the draft differs from what shoppers see (Publish lists and checks it). */
export type EditorPage = { id: string; template: PageTemplate; version: number; draft: PageDraft; fixed: boolean; dirty: boolean }
export const pagesForEditor = (tenantId: string) => withTenant(tenantId, async (tx): Promise<EditorPage[]> => {
  const rows = await tx.select().from(pagesTable).where(and(eq(pagesTable.tenantId, tenantId), isNull(pagesTable.removedAt))).orderBy(pagesTable.createdAt)
  return rows.flatMap((r) => {
    const d = draftOf(r)
    if (!d) return []
    const fixed = !!(r.live || r.previous || r.livePublishId)
    return [{ id: r.id, template: r.template as PageTemplate, version: r.version, draft: d, fixed, dirty: canon(targetOf(d)) !== canon(r.live) || !!d.removed }]
  })
})
