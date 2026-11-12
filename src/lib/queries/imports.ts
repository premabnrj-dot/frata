import 'server-only'
import { desc, eq } from 'drizzle-orm'
import { SOURCES, type Mapping, type Source } from '@/domains/catalogue/import/fields'
import type { SheetRow } from '@/domains/catalogue/import/group'
import { checkedOf, type Checked } from '@/domains/catalogue/import/plan'
import { readImport, type Seen } from '@/domains/catalogue/import/read'
import type { MemberRole } from '@/domains/tenancy/roles'
import { outcomeIn, type Outcome } from '@/lib/catalogue/import-drafts'
import { existingIn, hsnDigitsIn, shopCounts } from '@/lib/catalogue/imports'
import { importJobs } from '@/lib/db/schema-imports'
import { withTenant } from '@/lib/db/tenant'
import { costsVisibleIn } from './settings'

// =============================================================================
// FILE: src/lib/queries/imports.ts
//
// THE IMPORT PAGE'S READS (plan 2026-11-12-product-import PI·1 · 7), in one snapshot: the shop's facts the file's
// check needs (what it holds against the caps, HSN digits for its turnover, whether this member imports costs), the
// running job (to resume), the history, the newest import's outcome, and the last mapping from each source (used
// again for a file with the same headers). Never a cell: rows' cells stay in the database, and only while a job runs.
// =============================================================================

export type HistoryRow = {
  id: string; fileName: string; createdAt: Date; finishedAt: Date | null; added: number; inShop: number; leftOut: number
  planned: number; by: string | null; draftsDeleted: boolean
}
export type Running = { id: string; fileName: string; hash: string; mapping: Mapping; next: number; chunks: number; added: number }
export type ImportPage = {
  shop: { products: number; variants: number; hsnDigits: number; costs: boolean }
  running: Running | null
  history: HistoryRow[]
  latest: { id: string; outcome: Outcome } | null
  mappings: Partial<Record<Source, Mapping>>
}

export async function importPage(tenantId: string, role: MemberRole, now: Date): Promise<ImportPage> {
  return withTenant(tenantId, async (tx) => {
    const [costs, counts, hsnDigits, jobs] = await Promise.all([
      costsVisibleIn(tx, tenantId, role), shopCounts(tx, tenantId), hsnDigitsIn(tx, tenantId),
      tx.select().from(importJobs).where(eq(importJobs.tenantId, tenantId)).orderBy(desc(importJobs.createdAt)).limit(20),
    ])
    const open = jobs.find((j) => !j.finishedAt)
    const last = jobs.find((j) => j.finishedAt && !j.draftsDeletedAt)
    const mappings: Partial<Record<Source, Mapping>> = {}
    for (const s of SOURCES) { const j = jobs.find((x) => x.source === s); if (j) mappings[s] = j.mapping }
    return {
      shop: { ...counts, hsnDigits, costs },
      running: open ? { id: open.id, fileName: open.fileName, hash: open.fileHash ?? '', mapping: open.mapping, next: open.nextChunk, chunks: open.chunks, added: open.added } : null,
      history: jobs.map((j) => ({ id: j.id, fileName: j.fileName, createdAt: j.createdAt, finishedAt: j.finishedAt, added: j.added, inShop: j.inShop, leftOut: j.leftOut,
        planned: j.planned, by: j.startedByEmail, draftsDeleted: !!j.draftsDeletedAt })),
      latest: last ? { id: last.id, outcome: await outcomeIn(tx, tenantId, last.id, now) } : null,
      mappings: costs ? mappings : Object.fromEntries(Object.entries(mappings).map(([k, m]) => [k, { ...m, fields: m.fields.map((f) => (f === 'cost' ? null : f)) }])),
    }
  }, { snapshot: true })
}

/**
 * The Check step's reading of one chunk (plan.ts checkedOf): the pure rules with the shop's HSN digits and this
 * member's cost rule, and which products the shop already has. `seen` carries SKUs and barcodes from the file's
 * earlier chunks and comes back added to. Nothing is written.
 */
export async function checkRows(tenantId: string, role: MemberRole, mapping: Mapping, rows: SheetRow[], seen: Seen, now: Date): Promise<Checked> {
  return withTenant(tenantId, async (tx) => {
    const [costs, hsnDigits] = await Promise.all([costsVisibleIn(tx, tenantId, role), hsnDigitsIn(tx, tenantId)])
    const read = readImport(mapping, rows, { now, hsnDigits, costs }, seen)
    return checkedOf(read, await existingIn(tx, tenantId, read.products.map((p) => p.handle), read.products.flatMap((p) => p.skus)))
  }, { snapshot: true })
}
