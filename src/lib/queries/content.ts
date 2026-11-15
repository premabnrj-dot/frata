import 'server-only'
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm'
import { withTenant } from '@/lib/db/tenant'
import type { Tx } from '@/lib/db'
import { siteContent } from '@/lib/db/schema-content'
import { members } from '@/lib/db/schema'
import { collections, productImages, products } from '@/lib/db/schema-catalogue'
import { shopPages } from '@/lib/db/schema-themes'
import { hasOwnerIn } from './settings'
import { contentOf, type ContentRow, type StoreContent } from '@/domains/content/kinds'
import { ROLE_LABEL, type MemberRole } from '@/domains/tenancy/roles'
import { shopCached } from './storefront'

// =============================================================================
// FILE: src/lib/queries/content.ts — THE READ SEAM for a store's content (V1, plan docs/plans/2026-11-15-v1-content.md;
// spec docs/specs/2026-11-14-site-content-layer.md). Theme stores read it now; the Storefront API reads it later.
//   - shopContent: the store's rows, cached per store (tags shop:<t>, shop:<t>:content; 60 s backstop: the purge
//     limiter may leave a save to it). Rows only; the schedule is applied at render with the request's `now`
//     (src/domains/content/bar.ts), never inside the cache. Every row through its kind's tolerant reader.
//   - previewContent: the same core, uncached, for the console's previews (a save shows there at once).
//   - contentRowsIn: the editor's rows, inside the page's own transaction, with who saved each as a role, never an
//     email (security review M2).
// Page words and the FAQ stay in shop_pages (queries/pages.ts).
// =============================================================================

const COLS = { id: siteContent.id, kind: siteContent.kind, key: siteContent.key, value: siteContent.value, startsAt: siteContent.startsAt, endsAt: siteContent.endsAt, stoppedAt: siteContent.stoppedAt, createdAt: siteContent.createdAt, updatedAt: siteContent.updatedAt }

async function rowsIn(tx: Tx, tenantId: string): Promise<ContentRow[]> {
  return tx.select(COLS).from(siteContent).where(and(eq(siteContent.tenantId, tenantId), isNull(siteContent.deletedAt))).orderBy(asc(siteContent.createdAt))
}
const coreRows = (tenantId: string) => withTenant(tenantId, (tx) => rowsIn(tx, tenantId))

const shopRows = shopCached('content-v1', 'content', coreRows)
/** A store's content as its pages show it. A read that fails shows no bar and the default menus, never an error page. */
export const shopContent = async (tenantId: string): Promise<StoreContent> => contentOf(await shopRows(tenantId))
/** The same, uncached: the console's previews. */
export const previewContent = async (tenantId: string): Promise<StoreContent> => contentOf(await coreRows(tenantId))

/** A row as the editor shows it. `by`: who saved it last, as a role ("Owner", "Manager", "Partner"), "You", "A former
 *  member", or null while it is as the move copied it. */
export type EditorRow = { id: string; kind: string; key: string; value: unknown; startsAt: Date | null; endsAt: Date | null; stoppedAt: Date | null; createdAt: Date; updatedAt: Date; version: number; by: string | null }
export async function contentRowsIn(tx: Tx, tenantId: string, userId: string): Promise<EditorRow[]> {
  const [rows, people] = await Promise.all([
    tx.select({ ...COLS, version: siteContent.version, updatedBy: siteContent.updatedBy }).from(siteContent)
      .where(and(eq(siteContent.tenantId, tenantId), isNull(siteContent.deletedAt))).orderBy(asc(siteContent.createdAt)),
    tx.select({ userId: members.userId, role: members.role }).from(members).where(eq(members.tenantId, tenantId)),
  ])
  const role = new Map(people.map((p) => [p.userId, p.role]))
  return rows.map(({ updatedBy, ...r }) => ({ ...r, by: byOf(updatedBy, userId, role) }))
}
export function byOf(updatedBy: string | null, userId: string, roles: Map<string, string>): string | null {
  if (!updatedBy) return null
  if (updatedBy === userId) return 'You'
  const r = roles.get(updatedBy)
  return r ? (ROLE_LABEL[r as MemberRole] ?? 'A member') : 'A former member'
}

/**
 * Console › Content's reads, in ONE transaction (speed review L7: never a cached loader inside it): the store's content
 * rows with who saved each, whether it has an owner (who may save), its pages and FAQ, and what a link or a photo may
 * point at. The look's settings and the offer in the bar are cached loaders the page reads beside it, outside.
 */
export async function contentEditorData(tenantId: string, userId: string) {
  return withTenant(tenantId, async (tx) => {
    const [rows, hasOwner, partner, pages, cols, prods, photos] = await Promise.all([
      contentRowsIn(tx, tenantId, userId),
      hasOwnerIn(tx, tenantId),
      // Whether the store has a partner: the read-only chip names only roles the store has (words review 2026-11-15).
      tx.select({ id: members.userId }).from(members).where(and(eq(members.tenantId, tenantId), eq(members.role, 'partner'))).limit(1),
      tx.select({ id: shopPages.id, template: shopPages.template, version: shopPages.version, draft: shopPages.draft, live: shopPages.live, updatedAt: shopPages.updatedAt })
        .from(shopPages).where(and(eq(shopPages.tenantId, tenantId), isNull(shopPages.removedAt))).orderBy(asc(shopPages.createdAt)),
      tx.select({ handle: collections.handle, title: collections.title }).from(collections).where(eq(collections.tenantId, tenantId)).orderBy(asc(collections.title)).limit(200),
      tx.select({ handle: products.handle, title: products.title }).from(products).where(and(eq(products.tenantId, tenantId), eq(products.status, 'active')))
        .orderBy(desc(sql`coalesce(${products.publishAt}, ${products.publishedAt}, ${products.createdAt})`)).limit(60),
      tx.select({ base: productImages.base, widths: productImages.widths, width: productImages.width, height: productImages.height, alt: productImages.alt, title: products.title })
        .from(productImages).innerJoin(products, and(eq(products.id, productImages.productId), eq(products.tenantId, productImages.tenantId)))
        .where(and(eq(productImages.tenantId, tenantId), eq(productImages.position, 0), eq(products.status, 'active'))).orderBy(desc(productImages.createdAt)).limit(24),
    ])
    return { rows, hasOwner, hasPartner: partner.length > 0, pages, collections: cols, products: prods, photos }
  })
}
