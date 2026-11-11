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
// at all. The dedupe key makes a retried action a no-op. After the transaction
// commits, call drainSoon() (./drain.ts) so it is sent now, not at the next cron.
// =============================================================================

export async function enqueue(
  tx: Tx,
  row: { tenantId: string; kind: string; dedupeKey: string; payload: object; notBefore?: Date },
) {
  const { notBefore, ...values } = row
  await tx.insert(outbox).values({ ...values, ...(notBefore ? { nextAttemptAt: notBefore } : {}) }).onConflictDoNothing({ target: [outbox.tenantId, outbox.dedupeKey] })
}

/** A sender's "not now" (rate limited, not ready yet): the row waits `minutes` without spending an attempt. */
export class Later extends Error { constructor(readonly code: string, readonly minutes = 5) { super(code); this.name = 'Later' } }

export type OutboxRow = typeof outbox.$inferSelect

/** A sender's "this row can never succeed" (a malformed request of ours): the row stops at once with its reason. */
export class GiveUp extends Error { constructor(message: string) { super(message); this.name = 'GiveUp' } }

/**
 * Claims up to `limit` due rows. FOR UPDATE SKIP LOCKED lets two sweeps run at
 * once without sending a message twice. Bumps attempts and pushes the next try
 * out (1, 4, 9 … minutes) BEFORE the send, so a crash mid-send retries later.
 */
type RawRow = { id: string; tenant_id: string; kind: string; dedupe_key: string; payload: unknown; attempts: number; next_attempt_at: Date | string; sent_at: Date | string | null; dead_at: Date | string | null; last_error: string | null; created_at: Date | string }
const when = (v: Date | string | null) => (v === null ? null : new Date(v))
/** A raw row as the table names its columns, in the shape every sender reads (a raw execute returns snake_case: found
 *  by e2e 66-video, 2026-11-09; until then `row.tenantId` was undefined for every sender). */
export const fromRaw = (r: RawRow): OutboxRow => ({
  id: r.id, tenantId: r.tenant_id, kind: r.kind, dedupeKey: r.dedupe_key, payload: r.payload as OutboxRow['payload'], attempts: r.attempts,
  nextAttemptAt: new Date(r.next_attempt_at), sentAt: when(r.sent_at), deadAt: when(r.dead_at), lastError: r.last_error, createdAt: new Date(r.created_at),
})

export async function claimDue(limit = 25): Promise<OutboxRow[]> {
  // Through a definer: the outbox has no row readable without a shop set (email plan, tenancy and security reviews).
  return (await db().execute<RawRow>(sql`select * from app_outbox_claim(${limit})`) as unknown as RawRow[]).map(fromRaw)
}

export const MAX_ATTEMPTS = 8

const settle = (id: string, outcome: 'sent' | 'failed' | 'later' | 'dead', error: string | null, minutes = 0) =>
  db().execute(sql`select app_outbox_settle(${id}::uuid, ${outcome}, ${error === null ? null : error.slice(0, 500)}, ${minutes}, ${MAX_ATTEMPTS})`)

export async function markSent(id: string) { await settle(id, 'sent', null) }

/** A failed try: dead once the claim has spent MAX_ATTEMPTS. */
export async function markFailed(id: string, _attempts: number, error: string) { await settle(id, 'failed', error) }

/** Not now, and not a failure (a paused module, a 429, a shop's SES tenant not ready): no attempt spent. */
export async function deferRow(id: string, minutes = 15, why = 'paused') { await settle(id, 'later', why, minutes) }

/** A row that must never be sent (its module was turned off): dead at once, with the reason. */
export async function markDead(id: string, reason: string) { await settle(id, 'dead', reason) }

/** Turning a module off cancels its queued rows for that shop, in the switch's own transaction. */
export async function cancelQueued(tx: Tx, tenantId: string, kinds: readonly string[], reason: string) {
  if (!kinds.length) return 0
  const rows = await tx.update(outbox).set({ deadAt: new Date(), lastError: reason })
    .where(and(eq(outbox.tenantId, tenantId), isNull(outbox.sentAt), isNull(outbox.deadAt), inArray(outbox.kind, [...kinds])))
    .returning({ id: outbox.id })
  return rows.length
}
