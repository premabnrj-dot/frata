import { NextResponse } from 'next/server'
import { isCronRequest } from '@/lib/auth/cron'
import { runCredits } from '@/lib/studio/run'
import { errName } from '@/lib/log'

// ENTRY POINT credential: CRON_SECRET via isCronRequest (scripts/check-actions.mjs).
// Studio credits' hourly run (C1·3; speed review H3: its own route, never the daily outbox job): straggling attempts,
// seat renewals with their notices, renewal orders, refunds, mandate cancels and the partner's emails. Each step stops
// at the run's deadline and picks up on the next hour; every money step is claimed before its request.

export const maxDuration = 60

export async function GET(request: Request) {
  if (!isCronRequest(request)) return new NextResponse(null, { status: 401 })
  try {
    const r = await runCredits(new Date(), Date.now() + 50_000)
    return NextResponse.json(r)
  } catch (e) {
    console.error('[cron] credits', errName(e))
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
