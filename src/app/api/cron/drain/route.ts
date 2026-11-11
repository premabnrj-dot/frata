import { NextResponse } from 'next/server'
import { isCronRequest } from '@/lib/auth/cron'
import { drainOutbox } from '@/lib/outbox/drain'
import { errName } from '@/lib/log'

// ENTRY POINT credential: CRON_SECRET via isCronRequest (scripts/check-actions.mjs).
// Every 5 minutes (Vercel Pro; email plan decision 8, architecture review blocker A1): rows held back on purpose
// (Shipped +5 min, Finish paying after pay_by) and retries (1, 4, 9 … minutes) are sent on time, not at the daily
// sweep. The outbox only — the daily job (/api/cron/outbox) keeps erasure, billing and the event sweeps.

export const maxDuration = 60

export async function GET(request: Request) {
  if (!isCronRequest(request)) return new NextResponse(null, { status: 401 })
  try {
    const r = await drainOutbox(Date.now() + 50_000)
    return NextResponse.json(r)
  } catch (e) {
    console.error('[cron] drain', errName(e))
    return NextResponse.json({ error: 'drain' }, { status: 500 })
  }
}
