import 'server-only'
import { sql } from 'drizzle-orm'
import { db } from './index'

// =============================================================================
// FILE: src/lib/db/studio.ts — STUDIO'S TWO PLATFORM-SCOPE CALLS (plan docs/plans/2026-11-22-v3a-runtime.md § Advance;
// tenancy audit H4; the S4 rule). The cron's work list across stores is ids and a kind only, from a definer
// (`app_studio_due`); the bind sweep deletes binds over an hour old. Everything else Studio reads runs inside its
// store's transaction. check:studio pins these two definers to this file.
// =============================================================================

export type DueRow = { sessionId: string; tenantId: string; turnId: string | null; kind: 'advance' | 'end' | 'clean' | 'delete' }

/** The cron's work list, at most `limit` of each kind (ids only). */
export async function studioDue(limit: number): Promise<DueRow[]> {
  const rows = await db().execute(sql`select session_id, tenant_id, turn_id, kind from app_studio_due(${limit})`)
  return (rows as unknown as { session_id: string; tenant_id: string; turn_id: string | null; kind: DueRow['kind'] }[])
    .map((r) => ({ sessionId: r.session_id, tenantId: r.tenant_id, turnId: r.turn_id, kind: r.kind }))
}

/** Deletes binds over an hour old (never in a page's read). */
export async function sweepStudioBinds(): Promise<number> {
  const rows = await db().execute(sql`select app_studio_sweep_binds() as n`)
  return Number((rows as unknown as { n: number }[])[0]?.n ?? 0)
}
