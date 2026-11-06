import { NextResponse } from 'next/server'
import { isCronRequest } from '@/lib/auth/cron'
import { claimDue, markFailed, markSent, type OutboxRow } from '@/lib/outbox'

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
  return NextResponse.json({ claimed: rows.length, sent })
}
