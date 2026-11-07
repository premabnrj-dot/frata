import { NextResponse } from 'next/server'
import { isCronRequest } from '@/lib/auth/cron'
import { claimDue, markFailed, markSent, type OutboxRow } from '@/lib/outbox'
import { shopsWithPendingEvents } from '@/lib/db/platform'
import { processEvents } from '@/lib/orders/payment'

// ENTRY POINT credential: CRON_SECRET via isCronRequest (scripts/check-actions.mjs).
// The safety-net sweep. Connectors register a sender per `kind` as they are built;
// until one exists for a kind, its rows wait with a clear error.
const SENDERS: Record<string, (row: OutboxRow) => Promise<void>> = {}

export async function GET(request: Request) {
  if (!isCronRequest(request)) return new NextResponse(null, { status: 401 })
  const rows = await claimDue()
  let sent = 0
  for (const row of rows) {
    const send = SENDERS[row.kind]
    try {
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
  return NextResponse.json({ claimed: rows.length, sent, events })
}
