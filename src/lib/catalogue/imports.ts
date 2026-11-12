import 'server-only'
import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm'
import { sameHeaders, type Mapping } from '@/domains/catalogue/import/fields'
import type { SheetRow } from '@/domains/catalogue/import/group'
import { compactMapping, IMPORTS_PER_DAY, MAX_PRODUCTS } from '@/domains/catalogue/import/limits'
import { capRefusal, planImport, type Existing } from '@/domains/catalogue/import/plan'
import { clip, readImport, type ImportProduct, type Seen } from '@/domains/catalogue/import/read'
import { isSizeOption } from '@/domains/storefront/picker'
import type { Tx } from '@/lib/db'
import { products, productTypes, variants } from '@/lib/db/schema-catalogue'
import { importJobs, importRows } from '@/lib/db/schema-imports'
import { arrayParam } from '@/lib/db/sql-array'
import { hsnDigitsIn } from '@/lib/queries/settings'
import { ensureTypes } from './handles'
import { writeProducts } from './write'

// =============================================================================
// FILE: src/lib/catalogue/imports.ts
//
// AN IMPORT'S WRITES (plan 2026-11-12-product-import PI·1 · 6), each inside the caller's asMember transaction (so a
// support visit is audited with it). The browser drives a job chunk by chunk while the page is open; a closed page
// leaves it paused at next_chunk, resumed from there when the same file is chosen again. Nothing runs unattended.
//
// Rules:
// - Starting: one running job a shop (a second is refused; the same file resumes it, with the column matches it
//   started with), at most IMPORTS_PER_DAY started in 24 h (counted in the transaction: an error refuses, it never
//   lets one through), the same file imported once, and the file's own count re-checked against the shop's caps.
// - A chunk is read exactly as the Check read it: only the job's next one (an earlier one again is a no-op: a retry
//   after a lost answer); its rows read with the job's stored mapping by the same pure rules (domains/catalogue/import),
//   never the browser's verdict; the SKUs and barcodes of the job's earlier chunks carried in (`seen`, rebuilt from
//   their rows), and the drafts this job already wrote never counted as "already in your shop" (the Check ran before
//   them). A product's rows never in two chunks; the caps checked again before anything is written; drafts written by
//   writeProducts (costs only for a member who sees them); every row recorded with its product or what to fix.
// - A job that reads a cost column continues only for a member who sees costs (its chunks carry that column).
// - The last chunk ends the job; ending (or stopping) a job nulls its rows' cells (they hold costs).
// =============================================================================

export type Job = typeof importJobs.$inferSelect
/** A refusal in the member's words; `mapping`: the running job's, when the file was matched otherwise. */
export class Refused extends Error { constructor(public reason: string, public mapping?: Mapping) { super('refused') } }

const COSTS_ONLY = 'An owner or admin started this import with costs: they can continue it, or stop it here.'
const readsCost = (m: Mapping) => m.fields.includes('cost')
const sameMapping = (a: Mapping, b: Mapping) => a.source === b.source && sameHeaders(a.headers, b.headers) && a.fields.every((f, i) => f === b.fields[i])

/** Products and live sizes the shop holds now (archived ones don't count). */
export async function shopCounts(tx: Tx, tenantId: string) {
  const [r] = await tx.select({
    products: sql<number>`count(*)::int`,
    variants: sql<number>`(select count(*)::int from variants v join products p on p.tenant_id = v.tenant_id and p.id = v.product_id
      where v.tenant_id = ${tenantId} and v.archived_at is null and p.status <> 'archived')`,
  }).from(products).where(and(eq(products.tenantId, tenantId), sql`${products.status} <> 'archived'`))
  return { products: r?.products ?? 0, variants: r?.variants ?? 0 }
}

/** Which of these addresses and SKUs (upper case) the shop already has; `job`'s own drafts left out (it is writing them). */
export async function existingIn(tx: Tx, tenantId: string, handles: readonly string[], skus: readonly string[], job?: string): Promise<Existing> {
  const notJob = (id: typeof products.id | typeof variants.productId) => (job
    ? sql`not exists (select 1 from import_rows r where r.tenant_id = ${tenantId} and r.job_id = ${job} and r.product_id = ${id})` : sql`true`)
  const [h, s] = await Promise.all([
    handles.length ? tx.select({ handle: products.handle }).from(products)
      .where(and(eq(products.tenantId, tenantId), sql`${products.handle} = any(${arrayParam([...handles], 'text')})`, notJob(products.id))) : [],
    skus.length ? tx.select({ sku: sql<string>`upper(${variants.sku})` }).from(variants)
      .where(and(eq(variants.tenantId, tenantId), sql`${variants.sku} is not null`, sql`upper(${variants.sku}) = any(${arrayParam([...skus], 'text')})`, notJob(variants.productId))) : [],
  ])
  return { handles: new Set(h.map((x) => x.handle)), skus: new Set(s.map((x) => x.sku)) }
}

export type StartInput = { fileName: string; hash: string; mapping: Mapping; chunks: number; products: number; variants: number }
export type Who = { tenantId: string; userId: string; email: string | null; supportSessionId: string | null; costs: boolean }

/** A new job, or the running one for this same file (resume). */
export async function startJob(tx: Tx, who: Who, input: StartInput, now: Date): Promise<{ job: Job; resumed: boolean }> {
  const { tenantId } = who
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'import:' + tenantId}))`)
  const [running] = await tx.select().from(importJobs).where(and(eq(importJobs.tenantId, tenantId), isNull(importJobs.finishedAt)))
  if (running) {
    if (running.fileHash !== input.hash) throw new Refused(`Finish or stop the import of ${running.fileName} first.`)
    if (readsCost(running.mapping) && !who.costs) throw new Refused(COSTS_ONLY)
    if (!sameMapping(running.mapping, input.mapping)) throw new Refused('This import started with other column matches: it continues with those.', running.mapping)
    return { job: running, resumed: true }
  }
  const [done] = await tx.select({ at: importJobs.createdAt }).from(importJobs)
    .where(and(eq(importJobs.tenantId, tenantId), eq(importJobs.fileHash, input.hash), eq(importJobs.update, false)))
  if (done) throw new Refused('You imported this file already. Delete that import’s drafts to import it again.')
  const [day] = await tx.select({ n: sql<number>`count(*)::int` }).from(importJobs)
    .where(and(eq(importJobs.tenantId, tenantId), gt(importJobs.createdAt, new Date(now.getTime() - 86_400_000))))
  if ((day?.n ?? IMPORTS_PER_DAY) >= IMPORTS_PER_DAY) throw new Refused(`Up to ${IMPORTS_PER_DAY} imports a day. Try again tomorrow.`)
  if (input.products > MAX_PRODUCTS) throw new Refused(capRefusal(input, { products: 0, variants: 0 })!)
  const cap = capRefusal(input, await shopCounts(tx, tenantId))
  if (cap) throw new Refused(cap)
  const [job] = await tx.insert(importJobs).values({
    tenantId, fileName: input.fileName, fileHash: input.hash, source: input.mapping.source, mapping: input.mapping, chunks: input.chunks,
    planned: input.products, startedBy: who.userId, startedByEmail: who.supportSessionId ? null : who.email, supportSessionId: who.supportSessionId,
  }).returning()
  return { job: job!, resumed: false }
}

export type ChunkResult = { next: number; done: boolean; added: number; leftOut: number; inShop: number }

/** The job's next chunk, read again and written as drafts. */
export async function writeChunk(tx: Tx, tenantId: string, jobId: string, n: number, rows: SheetRow[], opts: { costs: boolean; now: Date }): Promise<ChunkResult> {
  const [job] = await tx.select().from(importJobs).where(and(eq(importJobs.tenantId, tenantId), eq(importJobs.id, jobId))).for('update')
  if (!job) throw new Refused('This import is not in your shop.')
  const counts = (j: Job): ChunkResult => ({ next: j.nextChunk, done: !!j.finishedAt, added: j.added, leftOut: j.leftOut, inShop: j.inShop })
  if (n < job.nextChunk) return counts(job)
  if (job.finishedAt) throw new Refused('This import has ended.')
  if (n > job.nextChunk || n >= job.chunks) throw new Refused('This part of the file came out of order. Choose the file again.')
  if (readsCost(job.mapping) && !opts.costs) throw new Refused(COSTS_ONLY)
  const m = compactMapping(job.mapping)
  if (rows.some((r) => r.cells.length !== m.fields.length)) throw new Refused('This part of the file doesn’t match its columns. Choose the file again.')

  // The earlier chunks' rows, read again only for the SKUs and barcodes they met (the Check carried them the same way).
  const ctx = { now: opts.now, hsnDigits: await hsnDigitsIn(tx, tenantId), costs: opts.costs }
  const seen: Seen = { skus: new Map(), gtins: new Map() }
  const before = await tx.select({ n: importRows.n, cells: importRows.cells }).from(importRows)
    .where(and(eq(importRows.tenantId, tenantId), eq(importRows.jobId, jobId), sql`${importRows.cells} is not null`)).orderBy(asc(importRows.n))
  if (before.length) readImport(m, before.map((r) => ({ n: r.n, cells: r.cells! })), ctx, seen)
  const read = readImport(m, rows, ctx, seen)

  const keys = read.products.map((p) => p.key)
  const [split] = await tx.select({ n: importRows.n }).from(importRows)
    .where(and(eq(importRows.tenantId, tenantId), eq(importRows.jobId, jobId), sql`${importRows.key} = any(${arrayParam(keys, 'text')})`)).limit(1)
  if (split) throw new Refused(`Row ${split.n}'s product came in two parts. Choose the file again.`)

  const plan = planImport(read.products, await existingIn(tx, tenantId, read.products.map((p) => p.handle), read.products.flatMap((p) => p.skus), jobId))
  const cap = capRefusal({ products: plan.fresh.length, variants: plan.variants }, await shopCounts(tx, tenantId))
  if (cap) throw new Refused(cap)

  // Drafts. writeProducts refuses before it writes (a barcode or SKU another product took meanwhile): that product is
  // left out with its words, and the rest are written.
  const refused = new Map<ImportProduct, string>()
  let fresh = [...plan.fresh]
  const sized = (p: ImportProduct) => p.draft!.options.some((o) => isSizeOption(o.name))
  if (fresh.some(sized)) await ensureTypes(tx, tenantId)
  const [type] = fresh.some(sized) ? await tx.select({ id: productTypes.id }).from(productTypes).where(eq(productTypes.tenantId, tenantId)).orderBy(asc(productTypes.name)).limit(1) : []
  let written: { id: string; handle: string }[] = []
  while (fresh.length) {
    const w = await writeProducts(tx, tenantId, fresh.map((p) => {
      const d = p.draft!
      return { handle: d.handle, title: d.title, options: d.options, variants: d.variants, row: { ...d.row, typeId: sized(p) ? type?.id ?? null : null } }
    }), { costs: opts.costs })
    if (w.ok) { written = w.products; break }
    refused.set(fresh[w.draft]!, w.error)
    fresh = fresh.filter((_, i) => i !== w.draft)
  }
  const idOf = new Map(fresh.map((p, i) => [p, written[i]!.id]))

  // Every row: its draft, or what to fix (a writer's refusal on the product's first row), or neither (in the shop).
  // What to fix is kept short: the row's errors hold at most 4 kB (import_rows_errors).
  const kept = new Set(plan.inShop)
  const byRow = new Map<number, { column: string; message: string }[]>()
  for (const p of read.problems) byRow.set(p.row, [...(byRow.get(p.row) ?? []), { column: clip(p.column, 60), message: clip(p.message, 200) }].slice(0, 8))
  const values = read.products.flatMap((p) => p.rows.map((rn, i) => {
    const why = kept.has(p) ? null : refused.has(p) && i === 0 ? [{ column: '', message: clip(refused.get(p)!, 200) }] : byRow.get(rn) ?? null
    return { tenantId, jobId, n: rn, key: p.key, cells: rows.find((r) => r.n === rn)!.cells, errors: why, productId: idOf.get(p) ?? null }
  }))
  if (values.length) await tx.insert(importRows).values(values)

  const leftOut = plan.leftOut.length + refused.size
  const last = n + 1 === job.chunks
  const [after] = await tx.update(importJobs).set({
    nextChunk: n + 1, added: sql`${importJobs.added} + ${fresh.length}`, leftOut: sql`${importJobs.leftOut} + ${leftOut}`, inShop: sql`${importJobs.inShop} + ${plan.inShop.length}`,
    updatedAt: opts.now, ...(last ? { finishedAt: opts.now } : {}),
  }).where(and(eq(importJobs.tenantId, tenantId), eq(importJobs.id, jobId))).returning()
  if (last) await forgetCells(tx, tenantId, jobId)
  return counts(after!)
}

/** Stop a running job where it is: what was imported stays. */
export async function stopJob(tx: Tx, tenantId: string, jobId: string, now: Date) {
  const [job] = await tx.update(importJobs).set({ finishedAt: now, updatedAt: now })
    .where(and(eq(importJobs.tenantId, tenantId), eq(importJobs.id, jobId), isNull(importJobs.finishedAt))).returning({ id: importJobs.id })
  if (job) await forgetCells(tx, tenantId, jobId)
  return !!job
}

/** A finished job's rows keep what they made and what to fix, never the cells (costs among them). */
export const forgetCells = (tx: Tx, tenantId: string, jobId: string) =>
  tx.update(importRows).set({ cells: null }).where(and(eq(importRows.tenantId, tenantId), eq(importRows.jobId, jobId), sql`${importRows.cells} is not null`))
