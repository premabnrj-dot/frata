import 'server-only'
import { after } from 'next/server'
import { outboxDecision } from '@/domains/modules/access'
import { moduleForKind } from '@/domains/modules/registry'
import { shopModules } from '@/lib/queries/modules'
import { errName } from '@/lib/log'
import { claimDue, deferRow, markDead, markFailed, markSent, type OutboxRow } from './index'
import { sendBillAttempt } from '@/lib/billing/debit'

// =============================================================================
// FILE: src/lib/outbox/drain.ts — sending what the outbox holds (speed review P5, 2026-11-08)
//
// The queue is drained right after a change enqueues (`drainSoon`, in after()),
// and by the cron as the safety net, batch after batch until it is empty or the
// time is spent — never one batch of 25 a day. Connectors register a sender per
// `kind` here as they are built; until one exists, its rows wait with a clear error.
// =============================================================================

export const SENDERS: Record<string, (row: OutboxRow) => Promise<void>> = {
  // Billing B3: a debit attempt on Frrata's own gateway. Never paused by a module switch (finding 13: no module owns it).
  'bill:attempt': sendBillAttempt,
}
const BATCH = 25

/** Sends due rows until none are left or `deadline` passes. Two drains at once never send a row twice (SKIP LOCKED). */
export async function drainOutbox(deadline: number): Promise<{ claimed: number; sent: number }> {
  let claimed = 0, sent = 0
  // One read of each shop's modules per drain, not one per row.
  const at = new Date().toISOString()
  const accessOf = new Map<string, Promise<Awaited<ReturnType<typeof shopModules>>['access']>>()
  const shopAccess = (tenantId: string) => { if (!accessOf.has(tenantId)) accessOf.set(tenantId, shopModules(tenantId, at).then((m) => m.access)); return accessOf.get(tenantId)! }
  while (Date.now() < deadline) {
    const rows = await claimDue(BATCH)
    claimed += rows.length
    for (const row of rows) {
      const send = SENDERS[row.kind]
      try {
        // A module's message goes only while the module is usable for that shop (moduleAccess): Frrata's pause
        // defers it, an off switch cancels it (architecture review 2026-11-07).
        const module = moduleForKind(row.kind)
        if (module) {
          const decision = outboxDecision((await shopAccess(row.tenantId))[module])
          if (decision === 'defer') { await deferRow(row.id); continue }
          if (decision === 'drop') { await markDead(row.id, `${module} is off for this shop`); continue }
        }
        if (!send) throw new Error(`no sender for ${row.kind}`)
        await send(row)
        await markSent(row.id)
        sent++
      } catch (err) {
        // Our own refusals keep their words; a database or sender error only its name and code (S10: a drizzle
        // error carries its parameters).
        await markFailed(row.id, row.attempts, err instanceof Error && !('cause' in err) && err.name === 'Error' ? err.message : errName(err))
      }
    }
    if (rows.length < BATCH) break
  }
  return { claimed, sent }
}

/**
 * After a change that enqueued commits: send now, after the response, within 20 s; the cron catches the rest.
 * Not called yet: nothing enqueues before the first sender (WhatsApp COD confirmation). That change calls it.
 */
export function drainSoon() {
  after(() => drainOutbox(Date.now() + 20_000).then(() => undefined, (e) => console.error('[outbox] drain', errName(e))))
}

/** Runs `work` over `items`, `limit` at a time (the cron's per-shop sweeps). */
export async function eachLimited<T>(items: readonly T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await work(items[next++]!)
  }))
}
