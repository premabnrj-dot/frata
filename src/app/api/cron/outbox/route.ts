import { processWhatsApp } from '@/lib/modules/communication/webhook'
import { NextResponse } from 'next/server'
import { isCronRequest } from '@/lib/auth/cron'
import { drainOutbox, eachLimited } from '@/lib/outbox/drain'
import { shopsToErase, shopsWithPendingEvents } from '@/lib/db/platform'
import { processEvents } from '@/lib/orders/payment'
import { ERASE_AFTER_DAYS, eraseAbandoned } from '@/lib/orders/erase'
import { errName } from '@/lib/log'
import { runDrafts } from '@/lib/billing/run'

// ENTRY POINT credential: CRON_SECRET via isCronRequest (scripts/check-actions.mjs).
// The safety-net sweep; the outbox itself drains right after each enqueue (src/lib/outbox/drain.ts).

/** One daily run (Vercel Hobby allows 60 s); shops four at a time: billing drafts until 15 s in, the outbox until 45 s. */
export const maxDuration = 60
const SHOPS_AT_ONCE = 4

export async function GET(request: Request) {
  if (!isCronRequest(request)) return new NextResponse(null, { status: 401 })
  const started = Date.now()
  // First, and on its own: shopper details on online orders never paid go after 90 days (retention), shop by
  // shop in each shop's own transaction — whatever happens to the sweeps below.
  let erased = 0
  try {
    const now = new Date()
    await eachLimited(await shopsToErase(new Date(now.getTime() - ERASE_AFTER_DAYS * 86_400_000)), SHOPS_AT_ONCE, async (tenantId) => {
      const n = await eraseAbandoned(tenantId, now).catch((e) => { console.error('[cron] erase', tenantId, errName(e)); return 0 })
      erased += n // read after the await: four shops run at once
    })
  } catch (e) { console.error('[cron] erase list', errName(e)) }
  // Billing B0: redraft each shop's invoice (this month until issued, and the month so far). Shadow only: nothing is
  // charged or sent; a failure is logged per shop and never stops the sweeps below.
  let billing = null
  // At most 15 s, so the outbox keeps its time; shops not reached are drafted on the next run.
  try { billing = await runDrafts(new Date(), undefined, started + 15_000) } catch (e) { console.error('[cron] billing', errName(e)) }
  const { claimed, sent } = await drainOutbox(started + 45_000)
  // Razorpay and WhatsApp events not yet processed (each is processed at once on arrival; this is only the safety net).
  let events = 0
  await eachLimited(await shopsWithPendingEvents(), SHOPS_AT_ONCE, async (tenantId) => {
    const n = await processEvents(tenantId, 200).catch((e) => { console.error('[cron] events', tenantId, errName(e)); return 0 })
    events += n
  })
  await eachLimited(await shopsWithPendingEvents('whatsapp'), SHOPS_AT_ONCE, async (tenantId) => {
    const n = await processWhatsApp(tenantId, new Date()).catch((e) => { console.error('[cron] whatsapp', tenantId, errName(e)); return 0 })
    events += n
  })
  return NextResponse.json({ claimed, sent, events, erased, billing })
}
