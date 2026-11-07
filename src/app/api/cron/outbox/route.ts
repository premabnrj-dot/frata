import { NextResponse } from 'next/server'
import { isCronRequest } from '@/lib/auth/cron'
import { claimDue, deferRow, markDead, markFailed, markSent, type OutboxRow } from '@/lib/outbox'
import { outboxDecision } from '@/domains/modules/access'
import { moduleForKind } from '@/domains/modules/registry'
import { shopModules } from '@/lib/queries/modules'
import { shopsToErase, shopsWithPendingEvents } from '@/lib/db/platform'
import { processEvents } from '@/lib/orders/payment'
import { ERASE_AFTER_DAYS, eraseAbandoned } from '@/lib/orders/erase'

// ENTRY POINT credential: CRON_SECRET via isCronRequest (scripts/check-actions.mjs).
// The safety-net sweep. Connectors register a sender per `kind` as they are built;
// until one exists for a kind, its rows wait with a clear error.
const SENDERS: Record<string, (row: OutboxRow) => Promise<void>> = {}

/** One daily run, shops in sequence (Vercel Hobby allows 60 s). */
export const maxDuration = 60

export async function GET(request: Request) {
  if (!isCronRequest(request)) return new NextResponse(null, { status: 401 })
  // First, and on its own: shopper details on online orders never paid go after 90 days (retention), shop by
  // shop in each shop's own transaction — whatever happens to the sweeps below.
  let erased = 0
  try {
    const now = new Date()
    for (const tenantId of await shopsToErase(new Date(now.getTime() - ERASE_AFTER_DAYS * 86_400_000))) {
      erased += await eraseAbandoned(tenantId, now).catch((e) => { console.error('[cron] erase', tenantId, e instanceof Error ? e.name : 'error'); return 0 })
    }
  } catch (e) { console.error('[cron] erase list', e instanceof Error ? e.name : 'error') }
  const rows = await claimDue()
  let sent = 0
  // One read of each shop's modules per sweep, not one per row.
  const at = new Date().toISOString()
  const accessOf = new Map<string, Promise<Awaited<ReturnType<typeof shopModules>>['access']>>()
  const shopAccess = (tenantId: string) => { if (!accessOf.has(tenantId)) accessOf.set(tenantId, shopModules(tenantId, at).then((m) => m.access)); return accessOf.get(tenantId)! }
  for (const row of rows) {
    const send = SENDERS[row.kind]
    try {
      // A module's message goes only while the module is usable for that shop (moduleAccess, read in the shop's
      // own transaction): Frrata's pause defers it, an off switch cancels it (architecture review 2026-11-07).
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
      await markFailed(row.id, row.attempts, err instanceof Error ? err.message : String(err))
    }
  }
  // Razorpay events not yet processed (each is processed at once on arrival; this is only the safety net).
  let events = 0
  for (const tenantId of await shopsWithPendingEvents()) {
    events += await processEvents(tenantId, 200).catch((e) => { console.error('[cron] events', tenantId, e instanceof Error ? e.name : 'error'); return 0 })
  }
  return NextResponse.json({ claimed: rows.length, sent, events, erased })
}
