// =============================================================================
// FILE: src/lib/db/schema-imports.ts
//
// PRODUCT IMPORTS (plan 2026-11-12-product-import PI·1 · 5). Same conventions as schema.ts. RLS, grants and the
// composite keys an FK can't say in drizzle: drizzle/0118_product_import.sql.
//
// - A job is one file: who started it (and the support visit, if any), the mapping its chunks are read with, how
//   far it got. It is running while finished_at is null; one running job per shop (import_jobs_one_running).
// - Its rows are the file's rows as the server read them: the product each made, or what to fix. Their cells hold
//   costs, so they are nulled when the job ends (lib/catalogue/imports.ts finishJob).
// - The same file (by its hash) is imported once; a job whose drafts were deleted gives its hash up.
// - frata_admin holds nothing here.
// =============================================================================

import { sql } from 'drizzle-orm'
import { boolean, check, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import type { Mapping } from '@/domains/catalogue/import/fields'
import { at, createdAt, id, supportSessions, tenants } from './schema'

export const importJobs = pgTable('import_jobs', {
  id: id(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  fileName: text('file_name').notNull(),
  /** SHA-256 of the file's bytes, hex. Null once the job's drafts are deleted (the file may come again). */
  fileHash: text('file_hash'),
  /** Update products already in the shop (PI·3). PI·1 imports new products only. */
  update: boolean('update').notNull().default(false),
  source: text('source').notNull(),
  mapping: jsonb('mapping').$type<Mapping>().notNull(),
  chunks: integer('chunks').notNull(),
  /** The next chunk the server will take; a paused job resumes here. */
  nextChunk: integer('next_chunk').notNull().default(0),
  /** What the file's check counted, re-counted by the server at the start. */
  planned: integer('planned').notNull(),
  added: integer('added').notNull().default(0),
  leftOut: integer('left_out').notNull().default(0),
  inShop: integer('in_shop').notNull().default(0),
  startedBy: uuid('started_by').notNull(),
  /** The member's email as it was at sign-in (as order_events): history needs no name lookup. Null on a support visit: history says Frrata support. */
  startedByEmail: text('started_by_email'),
  supportSessionId: uuid('support_session_id').references(() => supportSessions.id, { onDelete: 'restrict' }),
  createdAt: createdAt(),
  updatedAt: at('updated_at').notNull().defaultNow(),
  finishedAt: at('finished_at'),
  draftsDeletedAt: at('drafts_deleted_at'),
}, (t) => [
  unique('import_jobs_tenant_id').on(t.tenantId, t.id),
  unique('import_jobs_file').on(t.tenantId, t.fileHash, t.update),
  uniqueIndex('import_jobs_one_running').on(t.tenantId).where(sql`${t.finishedAt} is null`),
  index('import_jobs_tenant_created').on(t.tenantId, t.createdAt),
  check('import_jobs_source', sql`${t.source} in ('shopify','woocommerce','sheet')`),
  check('import_jobs_file_name', sql`length(${t.fileName}) between 1 and 200`),
  check('import_jobs_hash', sql`${t.fileHash} is null or ${t.fileHash} ~ '^[0-9a-f]{64}$'`),
  check('import_jobs_mapping', sql`jsonb_typeof(${t.mapping}) = 'object' and octet_length(${t.mapping}::text) <= 32768`),
  check('import_jobs_chunks', sql`${t.chunks} between 1 and 1000 and ${t.nextChunk} between 0 and ${t.chunks}`),
  check('import_jobs_counts', sql`${t.planned} between 0 and 600 and ${t.added} >= 0 and ${t.leftOut} >= 0 and ${t.inShop} >= 0`),
  check('import_jobs_finished', sql`${t.finishedAt} is not null or ${t.draftsDeletedAt} is null`),
])

export const importRows = pgTable('import_rows', {
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id').notNull(),
  /** The row's number in the sheet, as Excel shows it (the header is above it). */
  n: integer('n').notNull(),
  /** The product's rows share it (group.ts): a product is never split between two chunks. */
  key: text('key').notNull(),
  /** The mapped cells as sent; null once the job ends (they hold costs). */
  cells: text('cells').array(),
  /** What to fix, [{ column, message }]; null when the row's product was imported or is already in the shop. */
  errors: jsonb('errors').$type<{ column: string; message: string }[]>(),
  /** The draft this row's product became. Null: left out, already in the shop, or the draft was deleted. */
  productId: uuid('product_id'),
}, (t) => [
  primaryKey({ columns: [t.tenantId, t.jobId, t.n] }),
  // ON DELETE SET NULL (product_id) — the column list drizzle can't say — is in 0118.
  foreignKey({ name: 'import_rows_job_fk', columns: [t.tenantId, t.jobId], foreignColumns: [importJobs.tenantId, importJobs.id] }).onDelete('cascade'),
  index('import_rows_key').on(t.tenantId, t.jobId, t.key),
  index('import_rows_product').on(t.tenantId, t.productId).where(sql`${t.productId} is not null`),
  check('import_rows_n', sql`${t.n} between 2 and 100000`),
  check('import_rows_key_size', sql`length(${t.key}) between 1 and 300`),
  check('import_rows_cells', sql`${t.cells} is null or cardinality(${t.cells}) <= 100`),
  check('import_rows_errors', sql`${t.errors} is null or (jsonb_typeof(${t.errors}) = 'array' and octet_length(${t.errors}::text) <= 4096)`),
])
