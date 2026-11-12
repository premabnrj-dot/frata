import 'server-only'
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import type { Tx } from '@/lib/db'
import { productImages, products, productVideos, variants } from '@/lib/db/schema-catalogue'
import { importJobs, importRows } from '@/lib/db/schema-imports'
import { orderLines } from '@/lib/db/schema-orders'
import { arrayParam } from '@/lib/db/sql-array'
import { photosInUse } from './photos-in-use'
import { goLive, readinessIn } from './readiness'

// =============================================================================
// FILE: src/lib/catalogue/import-drafts.ts
//
// WHAT AN IMPORT MADE, AFTERWARDS (plan 2026-11-12-product-import PI·1 · 6, 7), inside the caller's tenant transaction.
//
// - The job's products are the ones its rows name (import_rows.product_id): never a product it didn't make.
// - "Delete this import's drafts" deletes only those still drafts that were never published or scheduled, never
//   ordered (no order line on any size, archived ones included) and have no product video; the rest are kept and
//   counted. Their photo files go after the commit, only those inside this shop's folder (the caller's acceptedBase)
//   and shown nowhere else (photosInUse). The job then gives up its file's hash, so the same file can come again.
// - "Publish the N ready" makes live only the job's drafts that need nothing more (readinessIn, the rule Publish
//   uses), the first time it is live recorded as Publish does.
// =============================================================================

/** The products this job made that still exist, locked for the change that follows. */
async function jobProducts(tx: Tx, tenantId: string, jobId: string) {
  const ids = (await tx.selectDistinct({ id: importRows.productId }).from(importRows)
    .where(and(eq(importRows.tenantId, tenantId), eq(importRows.jobId, jobId), isNotNull(importRows.productId)))).map((r) => r.id!)
  if (!ids.length) return []
  return tx.select({ id: products.id, status: products.status, publishedAt: products.publishedAt, publishAt: products.publishAt }).from(products)
    .where(and(eq(products.tenantId, tenantId), sql`${products.id} = any(${arrayParam(ids, 'uuid')})`)).orderBy(products.id).for('update')
}

export async function deleteDrafts(tx: Tx, tenantId: string, jobId: string, now: Date): Promise<{ deleted: number; kept: number; photos: { base: string; widths: number[] }[] } | null> {
  const [job] = await tx.select({ finishedAt: importJobs.finishedAt }).from(importJobs).where(and(eq(importJobs.tenantId, tenantId), eq(importJobs.id, jobId))).for('update')
  if (!job) return null
  const mine = await jobProducts(tx, tenantId, jobId)
  const drafts = mine.filter((p) => p.status === 'draft' && !p.publishedAt && !p.publishAt).map((p) => p.id)
  const list = arrayParam(drafts, 'uuid')
  const [sold, filmed] = drafts.length ? await Promise.all([
    tx.selectDistinct({ id: variants.productId }).from(orderLines).innerJoin(variants, and(eq(variants.tenantId, orderLines.tenantId), eq(variants.id, orderLines.variantId)))
      .where(and(eq(orderLines.tenantId, tenantId), sql`${variants.productId} = any(${list})`)),
    tx.select({ id: productVideos.productId }).from(productVideos).where(and(eq(productVideos.tenantId, tenantId), sql`${productVideos.productId} = any(${list})`)),
  ]) : [[], []]
  const keep = new Set([...sold, ...filmed].map((r) => r.id))
  const gone = drafts.filter((id) => !keep.has(id))
  let photos: { base: string; widths: number[] }[] = []
  if (gone.length) {
    const goneList = arrayParam(gone, 'uuid')
    const imgs = await tx.select({ base: productImages.base, widths: productImages.widths }).from(productImages)
      .where(and(eq(productImages.tenantId, tenantId), sql`${productImages.productId} = any(${goneList})`))
    const used = await photosInUse(tx, tenantId, imgs.map((i) => i.base), gone)
    photos = imgs.filter((i) => !used.has(i.base))
    await tx.delete(products).where(and(eq(products.tenantId, tenantId), sql`${products.id} = any(${goneList})`, eq(products.status, 'draft'), isNull(products.publishedAt)))
  }
  await tx.update(importJobs).set({ fileHash: null, draftsDeletedAt: now, updatedAt: now, ...(job.finishedAt ? {} : { finishedAt: now }) })
    .where(and(eq(importJobs.tenantId, tenantId), eq(importJobs.id, jobId)))
  if (!job.finishedAt) await tx.update(importRows).set({ cells: null }).where(and(eq(importRows.tenantId, tenantId), eq(importRows.jobId, jobId)))
  return { deleted: gone.length, kept: mine.length - gone.length, photos }
}

export type Outcome = { drafts: number; needPhotos: number; needGst: number; ready: string[] }

/** What the job's products still need, for Done's counts (drafts only: a product already live needs nothing from here). */
export async function outcomeIn(tx: Tx, tenantId: string, jobId: string, now: Date, lock = false): Promise<Outcome> {
  const mine = lock ? await jobProducts(tx, tenantId, jobId) : await tx.select({ id: products.id, status: products.status }).from(products)
    .where(and(eq(products.tenantId, tenantId), eq(products.status, 'draft'), sql`${products.id} in (select r.product_id from import_rows r where r.tenant_id = ${tenantId} and r.job_id = ${jobId})`))
  const drafts = mine.filter((p) => p.status === 'draft').map((p) => p.id)
  const facts = await readinessIn(tx, tenantId, drafts, now)
  const all = [...facts.entries()]
  return {
    drafts: drafts.length,
    needPhotos: all.filter(([, f]) => f.photos === 0).length,
    needGst: all.filter(([, f]) => f.taxReady === false).length,
    ready: all.filter(([, f]) => f.readiness.every((x) => x.ok)).map(([id]) => id),
  }
}

/** The job's drafts that need nothing more, made live. */
export async function publishReady(tx: Tx, tenantId: string, jobId: string, now: Date): Promise<number> {
  const { ready } = await outcomeIn(tx, tenantId, jobId, now, true)
  if (!ready.length) return 0
  return goLive(tx, tenantId, ready, now)
}
