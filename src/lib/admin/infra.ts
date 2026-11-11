import 'server-only'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import type { DbHealth } from '@/domains/infra/alerts'
import type { StaffOk } from '@/lib/auth/require-staff'
import { adminDb } from '@/lib/db/admin'
import { errName } from '@/lib/log'

// =============================================================================
// FILE: src/lib/admin/infra.ts — Admin › Infrastructure's reads (plan docs/plans/2026-11-11-guardrails-infra-a2.md I·0).
// The Supabase tab reads the database's health live through `admin_db_health()` (drizzle/0091): aggregates only, no row,
// no session's query or address (ADR-0007 amendment). Staff only: the caller passes its StaffOk.
// =============================================================================

const n = z.coerce.number()
const Health = z.object({
  db_bytes: n, max_connections: n, cache_hit: n.nullable(),
  connections: z.array(z.object({ role: z.string(), open: n, busy: n })),
  outbox_waiting: n, outbox_oldest_s: n.nullable(), outbox_dead_today: n, webhooks_waiting: n,
  tables: z.array(z.object({ name: z.string(), rows: n, bytes: n })),
  queries: z.array(z.object({ shape: z.string(), calls: n, mean_ms: n, total_ms: n })),
})

/** The database's health now, or null when Admin can't read it (the tab says so; nothing else on the page fails). */
export async function dbHealth(staff: StaffOk): Promise<DbHealth | null> {
  void staff
  try {
    const [row] = await adminDb().execute<{ h: unknown }>(sql`select admin_db_health() as h`) as unknown as { h: unknown }[]
    const h = Health.parse(row?.h)
    return {
      dbBytes: h.db_bytes, maxConnections: h.max_connections, cacheHit: h.cache_hit, connections: h.connections,
      outboxWaiting: h.outbox_waiting, outboxOldestS: h.outbox_oldest_s, outboxDeadToday: h.outbox_dead_today, webhooksWaiting: h.webhooks_waiting,
      tables: h.tables, queries: h.queries.map((q) => ({ shape: q.shape, calls: q.calls, meanMs: q.mean_ms, totalMs: q.total_ms })),
    }
  } catch (e) {
    console.error('[infra] db health', errName(e))
    return null
  }
}
