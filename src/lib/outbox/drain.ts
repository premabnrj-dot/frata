import 'server-only'
import { after } from 'next/server'
import { outboxDecision } from '@/domains/modules/access'
import { moduleForKind } from '@/domains/modules/registry'
import { shopModules } from '@/lib/queries/modules'
import { errName } from '@/lib/log'
import { claimDue, deferRow, GiveUp, Later, markDead, markFailed, markSent, type OutboxRow } from './index'
import { sendBillAttempt } from '@/lib/billing/debit'
import { sendDomainAdd, sendDomainRemove } from '@/lib/domains/senders'
import { sendReviewAsk } from '@/lib/modules/reviews/sender'
import { sendAssetDelete, sendRenditionCreate, sendUploadCancel } from '@/lib/video/senders'
import { sendNoticeEmail } from '@/lib/email/notice-sender'
import { sendOrderEmail, sendTenantSetup } from '@/lib/email/order-sender'
import { E2E_FIXTURES, VERCEL_ENV } from '@/lib/env'

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
  // Own domains D2·6: a proved host onto the Vercel project (never before its own proof).
  'domain.add': sendDomainAdd,
  // D2·7: a parked host off the project once it points away (kept when another shop holds it live).
  'domain.remove': sendDomainRemove,
  // Reviews R1: the ask after delivery, on the shop's own WhatsApp number (Meta bills the merchant).
  'review:ask': sendReviewAsk,
  // V1 video: a removed video's Mux asset, and an upload URL nobody should use any more (ids from the row).
  'mux.asset.delete': sendAssetDelete,
  'mux.upload.cancel': sendUploadCancel,
  'mux.rendition.create': sendRenditionCreate,
  // Email E·1: a Frrata notice to the shop's people (recipients, preferences and reads resolved when it sends).
  'email.notice': sendNoticeEmail,
  // Email E·2: an order email to the shopper in the shop's brand; and a shop's SES tenant, set up once, paced.
  'email.order': sendOrderEmail,
  'email.tenant': sendTenantSetup,
}
const BATCH = 25

/** Sends due rows until none are left or `deadline` passes. Two drains at once never send a row twice (SKIP LOCKED). */
export async function drainOutbox(deadline: number): Promise<{ claimed: number; sent: number }> {
  let claimed = 0, sent = 0
  // Only production sends (security review H4): a preview build that shares production's database would otherwise
  // drain the real queue with unreviewed code. The e2e stack runs a production build against its own database.
  if (VERCEL_ENV !== 'production' && !E2E_FIXTURES) return { claimed, sent }
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
        if (err instanceof GiveUp) { await markDead(row.id, err.message); continue }
        if (err instanceof Later) { await deferRow(row.id, err.minutes, err.code); continue }
        // Our own refusals keep their words; a database or sender error only its name and code (S10: a drizzle
        // error carries its parameters).
        await markFailed(row.id, err instanceof Error && !('cause' in err) && err.name === 'Error' ? err.message : errName(err))
      }
    }
    if (rows.length < BATCH) break
  }
  return { claimed, sent }
}

/**
 * After a change that enqueued commits: send now, after the response, within 20 s; /api/cron/drain catches the rest
 * every 5 minutes (order emails: placing, paying, switching to COD and every console order action call it).
 */
let draining = false, again = false
export function drainSoon() {
  // One drain per instance at a time (speed review L3): checkouts at festive volume would otherwise each hold one. A
  // call during a drain asks for one more pass when it ends, so a row queued after its last claim is not left for the
  // 5-minute cron (impact review E·2).
  if (draining) { again = true; return }
  draining = true
  const run = async () => {
    try { let passes = 0; do { again = false; await drainOutbox(Date.now() + 20_000) } while (again && ++passes < 3) } // bounded: the cron sweeps the rest
    catch (e) { console.error('[outbox] drain', errName(e)) }
    finally { draining = false }
  }
  try { after(run) } catch (e) { draining = false; throw e }
}

/** Runs `work` over `items`, `limit` at a time (the cron's per-shop sweeps). */
export async function eachLimited<T>(items: readonly T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await work(items[next++]!)
  }))
}
