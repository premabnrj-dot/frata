import 'server-only'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
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

/** A module paused by Frrata: hold the row back without spending an attempt (the claim bumped one). */
export async function deferRow(id: string, minutes = 15) {
  await db().execute(sql`update outbox set attempts = greatest(attempts - 1, 0),
    next_attempt_at = now() + make_interval(mins => ${minutes}), last_error = 'paused' where id = ${id}`)
}

/** A row that must never be sent (its module was turned off): dead at once, with the reason. */
export async function markDead(id: string, reason: string) {
  await db().execute(sql`update outbox set dead_at = now(), last_error = ${reason.slice(0, 500)} where id = ${id}`)
}

/** Turning a module off cancels its queued rows for that shop, in the switch's own transaction. */
export async function cancelQueued(tx: Tx, tenantId: string, kinds: readonly string[], reason: string) {
  if (!kinds.length) return 0
  const rows = await tx.update(outbox).set({ deadAt: new Date(), lastError: reason })
    .where(and(eq(outbox.tenantId, tenantId), isNull(outbox.sentAt), isNull(outbox.deadAt), inArray(outbox.kind, [...kinds])))
    .returning({ id: outbox.id })
  return rows.length
}
