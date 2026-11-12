import { NextResponse } from 'next/server'
import { isCronRequest } from '@/lib/auth/cron'
import { drainOutbox, eachLimited } from '@/lib/outbox/drain'
import { shopsWithPendingEvents } from '@/lib/db/platform'
import { processEvents } from '@/lib/orders/payment'
import { errName } from '@/lib/log'

// ENTRY POINT credential: CRON_SECRET via isCronRequest (scripts/check-actions.mjs).
// Every 5 minutes (Vercel Pro; email plan decision 8, architecture review blocker A1): rows held back on purpose
// (Shipped +5 min, Finish paying after pay_by) and retries (1, 4, 9 … minutes) are sent on time, not at the daily
// sweep. The outbox, and Razorpay events still waiting: a payment's event is processed on arrival, and one left
// because the shop was busy at a drop (payment.ts withSlot) is marked paid here within minutes, not at the daily
// sweep. The daily job (/api/cron/outbox) keeps erasure, billing and the other event sweeps.

export const maxDuration = 60

export async function GET(request: Request) {
  if (!isCronRequest(request)) return new NextResponse(null, { status: 401 })
  const started = Date.now()
  let events = 0
  // Usually no shop: events are processed as they arrive. At most 15 s, so the outbox keeps its time.
  try {
    const shops = await shopsWithPendingEvents()
    await eachLimited(shops, 4, async (tenantId) => {
      if (Date.now() > started + 15_000) return
      // The same deadline inside: no event starts after it (each may wait 2 s on a lock).
      const n = await processEvents(tenantId, 50, started + 15_000).catch((e) => { console.error('[cron] drain events', tenantId, errName(e)); return 0 })
      events += n // read after the await: four shops run at once
    })
  } catch (e) { console.error('[cron] drain events list', errName(e)) }
  try {
    const r = await drainOutbox(started + 50_000)
    return NextResponse.json({ ...r, events })
  } catch (e) {
    console.error('[cron] drain', errName(e))
    return NextResponse.json({ error: 'drain' }, { status: 500 })
  }
}
