import 'server-only'
import { sql } from 'drizzle-orm'
import { db, type Tx } from '@/lib/db'
import { outbox } from '@/lib/db/schema'

// =============================================================================
// FILE: src/lib/outbox/index.ts
//
// A CALL TO THE OUTSIDE WORLD IS A ROW BEFORE IT IS A REQUEST (from Ekatan).
// `enqueue` runs inside the same withTenant transaction as the change that
// caused it, so an order and its WhatsApp confirmation commit together or not
// at all. The dedupe key makes a retried action a no-op.
// =============================================================================

export async function enqueue(
  tx: Tx,
  row: { tenantId: string; kind: string; dedupeKey: string; payload: object },
) {
  await tx.insert(outbox).values(row).onConflictDoNothing({ target: [outbox.tenantId, outbox.dedupeKey] })
}

export type OutboxRow = typeof outbox.$inferSelect

/**
 * Claims up to `limit` due rows. FOR UPDATE SKIP LOCKED lets two sweeps run at
 * once without sending a message twice. Bumps attempts and pushes the next try
 * out (1, 4, 9 … minutes) BEFORE the send, so a crash mid-send retries later.
 */
export async function claimDue(limit = 25): Promise<OutboxRow[]> {
  return db().execute<OutboxRow>(sql`
    update outbox set attempts = attempts + 1,
      next_attempt_at = now() + make_interval(mins => (attempts + 1) * (attempts + 1))
    where id in (
      select id from outbox
      where sent_at is null and dead_at is null and next_attempt_at <= now()
      order by next_attempt_at limit ${limit}
      for update skip locked)
    returning *`) as unknown as Promise<OutboxRow[]>
}

export const MAX_ATTEMPTS = 8

export async function markSent(id: string) {
  await db().execute(sql`update outbox set sent_at = now(), last_error = null where id = ${id}`)
}

export async function markFailed(id: string, attempts: number, error: string) {
  await db().execute(sql`
    update outbox set last_error = ${error.slice(0, 500)},
      dead_at = case when ${attempts} >= ${MAX_ATTEMPTS} then now() else null end
    where id = ${id}`)
}
