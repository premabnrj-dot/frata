import 'server-only'
import { and, eq, isNull, sql } from 'drizzle-orm'
import type { Tx } from '@/lib/db'
import { productImages, products, productVideos, variants } from '@/lib/db/schema-catalogue'
import { orderLines } from '@/lib/db/schema-orders'
import { arrayParam } from '@/lib/db/sql-array'
import { photosInUse } from './photos-in-use'

// =============================================================================
// FILE: src/lib/catalogue/delete-products.ts
//
// WHICH PRODUCTS CAN BE DELETED, AND DELETING THEM — the one rule (products PR·1 plan; an import's "Delete this import's
// drafts" and the list's Delete both call it), inside the caller's tenant transaction:
// - only a draft never published or scheduled, never ordered (an order line on any size, archived ones included) and
//   with no product video goes; any other is kept with the reason, and the list offers to archive it;
// - the rows are locked in id order first; the delete re-checks draft and never published in its own WHERE;
// - the photos whose files can go are returned (nothing else in the shop shows them: photosInUse), for
//   removePhotoFiles after the commit.
// =============================================================================

export type Kept = { id: string; why: 'archived' | 'live' | 'ordered' | 'video' }

export async function deleteProducts(tx: Tx, tenantId: string, ids: readonly string[]): Promise<{ deleted: string[]; kept: Kept[]; photos: { base: string; widths: number[] }[] }> {
  if (!ids.length) return { deleted: [], kept: [], photos: [] }
  const rows = await tx.select({ id: products.id, status: products.status, publishedAt: products.publishedAt, publishAt: products.publishAt }).from(products)
    .where(and(eq(products.tenantId, tenantId), sql`${products.id} = any(${arrayParam([...ids], 'uuid')})`)).orderBy(products.id).for('update')
  const kept: Kept[] = rows.filter((p) => p.status !== 'draft' || p.publishedAt || p.publishAt).map((p) => ({ id: p.id, why: p.status === 'archived' ? 'archived' : 'live' }))
  const drafts = rows.filter((p) => !kept.some((k) => k.id === p.id)).map((p) => p.id)
  const list = arrayParam(drafts, 'uuid')
  const [sold, filmed] = drafts.length ? await Promise.all([
    tx.selectDistinct({ id: variants.productId }).from(orderLines).innerJoin(variants, and(eq(variants.tenantId, orderLines.tenantId), eq(variants.id, orderLines.variantId)))
      .where(and(eq(orderLines.tenantId, tenantId), sql`${variants.productId} = any(${list})`)),
    tx.select({ id: productVideos.productId }).from(productVideos).where(and(eq(productVideos.tenantId, tenantId), sql`${productVideos.productId} = any(${list})`)),
  ]) : [[], []]
  const soldIds = new Set(sold.map((r) => r.id)), filmedIds = new Set(filmed.map((r) => r.id))
  for (const id of drafts) if (soldIds.has(id)) kept.push({ id, why: 'ordered' }); else if (filmedIds.has(id)) kept.push({ id, why: 'video' })
  const gone = drafts.filter((id) => !soldIds.has(id) && !filmedIds.has(id))
  if (!gone.length) return { deleted: [], kept, photos: [] }
  const goneList = arrayParam(gone, 'uuid')
  const imgs = await tx.select({ base: productImages.base, widths: productImages.widths }).from(productImages)
    .where(and(eq(productImages.tenantId, tenantId), sql`${productImages.productId} = any(${goneList})`))
  const used = await photosInUse(tx, tenantId, imgs.map((i) => i.base), gone)
  const done = await tx.delete(products).where(and(eq(products.tenantId, tenantId), sql`${products.id} = any(${goneList})`, eq(products.status, 'draft'), isNull(products.publishedAt), isNull(products.publishAt)))
    .returning({ id: products.id })
  return { deleted: done.map((d) => d.id), kept, photos: imgs.filter((i) => !used.has(i.base)) }
}
