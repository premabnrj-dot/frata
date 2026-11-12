'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { CELL_MAX } from '@/domains/catalogue/import/cells'
import { FIELDS, SOURCES, type Field, type Mapping } from '@/domains/catalogue/import/fields'
import { CHUNK_BYTES, MAX_COLUMNS, MAX_ROWS } from '@/domains/catalogue/import/limits'
import { asMember } from '@/lib/auth/as-member'
import { memberAudit } from '@/lib/auth/member-audit'
import { ANY_MEMBER, requireMember } from '@/lib/auth/require-member'
import { deleteDrafts, publishReady } from '@/lib/catalogue/import-drafts'
import { removePhotoFiles } from '@/lib/catalogue/photo-files'
import { skuTaken } from '@/lib/catalogue/write'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'
import { Refused, startJob, stopJob, writeChunk, type ChunkResult } from '@/lib/catalogue/imports'
import { errName } from '@/lib/log'
import { checkRows } from '@/lib/queries/imports'
import type { Checked } from '@/domains/catalogue/import/plan'
import { costsVisibleIn } from '@/lib/queries/settings'
import { refreshShop } from '@/lib/queries/storefront'

// =============================================================================
// Product import (plan 2026-11-12-product-import PI·1 · 6). The browser reads the file and sends it in chunks while
// the page is open; every rule is run again here (lib/catalogue/imports.ts). Who: ANY_MEMBER, as for editing a product
// (staff run catalogues, owner 2026-11-08); costs only for a member who sees them (costsVisibleIn, in the transaction).
// The tenant is always the member's, never the file's or the call's. Every write goes through asMember, so a support
// visit is audited with it. Drafts never reach shoppers: only Publish the N ready purges the shop's catalogue.
//
// | Action              | Who        | Does                                                                     |
// |---------------------|------------|--------------------------------------------------------------------------|
// | checkImport         | ANY_MEMBER | one chunk read by the rules for the Check step; the shop's matches (a read) |
// | startImport         | ANY_MEMBER | a job for this file, or the running one resumed                          |
// | importChunk         | ANY_MEMBER | the job's next chunk, read again and written as drafts                   |
// | stopImport          | ANY_MEMBER | ends a paused job where it is                                            |
// | deleteImportDrafts  | ANY_MEMBER | deletes the job's never-published, never-ordered drafts                  |
// | publishImportReady  | ANY_MEMBER | makes live the job's drafts that need nothing more                       |
// =============================================================================

type Fail = { ok: false; error: string; mapping?: Mapping }
const SKU_TAKEN = 'A SKU in this part was just taken by another product. Choose the file again.'
const FIELD = z.enum(Object.keys(FIELDS) as [Field, ...Field[]])
const MappingSchema = z.object({
  source: z.enum(SOURCES),
  headers: z.array(z.string().max(200)).max(MAX_COLUMNS),
  fields: z.array(FIELD.nullable()).max(MAX_COLUMNS),
}).strict().refine((m) => m.headers.length === m.fields.length && new Set(m.fields.filter(Boolean)).size === m.fields.filter(Boolean).length)
const Rows = z.array(z.object({ n: z.number().int().min(2).max(100_000), cells: z.array(z.string().max(CELL_MAX)).max(MAX_COLUMNS) }).strict()).min(1).max(MAX_ROWS)
const Start = z.object({
  fileName: z.string().trim().min(1).max(200), hash: z.string().regex(/^[0-9a-f]{64}$/), mapping: MappingSchema,
  chunks: z.number().int().min(1).max(1000), products: z.number().int().min(0).max(100_000), variants: z.number().int().min(0).max(1_000_000),
}).strict()
const Chunk = z.object({
  jobId: z.uuid(), n: z.number().int().min(0).max(999),
  rows: Rows,
}).strict()
const Pairs = z.array(z.tuple([z.string().max(60), z.number().int().min(2).max(100_000)])).max(20_000)
/** A chunk to check: its compact mapping (mapped columns only), its rows, and the SKUs and barcodes met before it. */
const Check = z.object({ mapping: MappingSchema, rows: Rows, seen: z.object({ skus: Pairs, gtins: Pairs }).strict() }).strict()
  .refine((c) => c.mapping.fields.every((f) => f !== null) && c.rows.every((r) => r.cells.length === c.mapping.fields.length))
export type SeenList = { skus: [string, number][]; gtins: [string, number][] }
const JobId = z.uuid()
const encoder = new TextEncoder()

const said = (where: string, err: unknown, fallback: string): Fail => {
  if (err instanceof Refused) return { ok: false, error: err.reason, ...(err.mapping ? { mapping: err.mapping } : {}) }
  const why = errName(err)
  if (why.includes('import_jobs_one_running')) return { ok: false, error: 'Another import is running in your shop. Finish or stop it first.' }
  if (why.includes('import_jobs_file')) return { ok: false, error: 'You imported this file already.' }
  if (skuTaken(err)) return { ok: false, error: SKU_TAKEN }
  console.error(`[${where}]`, why)
  return { ok: false, error: fallback }
}

export async function checkImport(input: unknown): Promise<({ ok: true; seen: SeenList } & Checked) | Fail> {
  const auth = await requireMember(ANY_MEMBER)
  if (!auth.ok) return { ok: false, error: auth.message }
  let size = Infinity
  try { size = encoder.encode(JSON.stringify(input)).length } catch { /* not JSON: refused below */ }
  const p = Check.safeParse(input)
  if (size > CHUNK_BYTES * 2 || !p.success) return { ok: false, error: 'This file’s rows did not come through. Choose the file again.' }
  // Reading a chunk is CPU: a shop checks at most LIMITS.importCheckShop chunks an hour, failing closed.
  if (!(await withinLimit(LIMITS.importCheckShop, auth.membership.tenantId, new Date(), true))) return { ok: false, error: 'Many files checked this hour. Try again in a while.' }
  try {
    const seen = { skus: new Map(p.data.seen.skus), gtins: new Map(p.data.seen.gtins) }
    const checked = await checkRows(auth.membership.tenantId, auth.membership.role, p.data.mapping, p.data.rows, seen, new Date())
    return { ok: true, ...checked, seen: { skus: [...seen.skus], gtins: [...seen.gtins] } }
  } catch (err) {
    return said('checkImport', err, 'We could not check your file. Try again in a minute.')
  }
}

export async function startImport(input: unknown): Promise<{ ok: true; jobId: string; next: number; chunks: number; resumed: boolean } | Fail> {
  const p = Start.safeParse(input)
  if (!p.success) return { ok: false, error: 'This file’s check did not come through. Choose the file again.' }
  try {
    const r = await asMember(ANY_MEMBER, { action: 'product.import.start', target: p.data.fileName }, async (tx, auth) => {
      const costs = await costsVisibleIn(tx, auth.membership.tenantId, auth.membership.role)
      const mapping = { ...p.data.mapping, fields: p.data.mapping.fields.map((f) => (f === 'cost' && !costs ? null : f)) }
      const started = await startJob(tx, { tenantId: auth.membership.tenantId, userId: auth.userId, email: auth.email, supportSessionId: auth.membership.supportSessionId, costs }, { ...p.data, mapping }, new Date())
      if (!started.resumed) await memberAudit(tx, auth, 'product.import.start', started.job.id)
      return started
    })
    if (!r.ok) return { ok: false, error: r.error }
    return { ok: true, jobId: r.value.job.id, next: r.value.job.nextChunk, chunks: r.value.job.chunks, resumed: r.value.resumed }
  } catch (err) {
    return said('startImport', err, 'We could not start the import. Nothing was changed.')
  }
}

export async function importChunk(input: unknown): Promise<({ ok: true } & ChunkResult) | Fail> {
  // A chunk is at most 512 kB (the browser packs them so); a bigger call is refused before it is read.
  let size = Infinity
  try { size = encoder.encode(JSON.stringify(input)).length } catch { /* not JSON: refused below */ }
  if (size > CHUNK_BYTES) return { ok: false, error: 'This part of the file is too large. Choose the file again.' }
  const p = Chunk.safeParse(input)
  if (!p.success) return { ok: false, error: 'This part of the file did not come through. Choose the file again.' }
  try {
    const r = await asMember(ANY_MEMBER, { action: 'product.import.chunk', target: p.data.jobId, detail: { chunk: p.data.n, rows: p.data.rows.length } }, async (tx, auth) => {
      const costs = await costsVisibleIn(tx, auth.membership.tenantId, auth.membership.role)
      const out = await writeChunk(tx, auth.membership.tenantId, p.data.jobId, p.data.n, p.data.rows, { costs, now: new Date() })
      if (out.done && out.next === p.data.n + 1) await memberAudit(tx, auth, 'product.import.done', p.data.jobId)
      return out
    })
    if (!r.ok) return { ok: false, error: r.error }
    revalidatePath('/console/products')
    return { ok: true, ...r.value }
  } catch (err) {
    return said('importChunk', err, 'We could not import this part. Nothing from it was saved. Try again.')
  }
}

export async function stopImport(jobId: unknown): Promise<{ ok: true } | Fail> {
  const id = JobId.safeParse(jobId)
  if (!id.success) return { ok: false, error: 'That import is not in your shop.' }
  try {
    const r = await asMember(ANY_MEMBER, { action: 'product.import.stop', target: id.data }, async (tx, auth) => {
      const stopped = await stopJob(tx, auth.membership.tenantId, id.data, new Date())
      if (stopped) await memberAudit(tx, auth, 'product.import.stop', id.data)
      return stopped
    })
    if (!r.ok) return { ok: false, error: r.error }
    revalidatePath('/console/products/import')
    return r.value ? { ok: true } : { ok: false, error: 'That import has already ended.' }
  } catch (err) {
    return said('stopImport', err, 'We could not stop the import. Try again.')
  }
}

export async function deleteImportDrafts(jobId: unknown): Promise<{ ok: true; deleted: number; kept: number } | Fail> {
  const id = JobId.safeParse(jobId)
  if (!id.success) return { ok: false, error: 'That import is not in your shop.' }
  try {
    const r = await asMember(ANY_MEMBER, { action: 'product.import.delete_drafts', target: id.data }, async (tx, auth) => {
      const out = await deleteDrafts(tx, auth.membership.tenantId, id.data, new Date())
      if (out) await memberAudit(tx, auth, 'product.import.delete_drafts', id.data)
      return out
    })
    if (!r.ok) return { ok: false, error: r.error }
    if (!r.value) return { ok: false, error: 'That import is not in your shop.' }
    // The files go after the commit, only those exactly inside this shop's folder.
    await removePhotoFiles(r.tenantId, r.value.photos, 'deleteImportDrafts')
    revalidatePath('/console/products', 'layout')
    return { ok: true, deleted: r.value.deleted, kept: r.value.kept }
  } catch (err) {
    return said('deleteImportDrafts', err, 'We could not delete the drafts. Nothing was changed.')
  }
}

export async function publishImportReady(jobId: unknown): Promise<{ ok: true; published: number } | Fail> {
  const id = JobId.safeParse(jobId)
  if (!id.success) return { ok: false, error: 'That import is not in your shop.' }
  try {
    const r = await asMember(ANY_MEMBER, { action: 'product.import.publish', target: id.data }, async (tx, auth) => {
      const n = await publishReady(tx, auth.membership.tenantId, id.data, new Date())
      if (n) await memberAudit(tx, auth, 'product.import.publish', id.data)
      return n
    })
    if (!r.ok) return { ok: false, error: r.error }
    if (r.value) refreshShop(r.tenantId, 'catalogue')
    revalidatePath('/console/products', 'layout')
    return { ok: true, published: r.value }
  } catch (err) {
    return said('publishImportReady', err, 'We could not publish them. Nothing was changed.')
  }
}
