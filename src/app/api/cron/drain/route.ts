import { NextResponse } from 'next/server'
import { isCronRequest } from '@/lib/auth/cron'
import { drainOutbox, eachLimited } from '@/lib/outbox/drain'
import { shopsWithBoundary, shopsWithContentChange, shopsWithDomainGone, shopsWithKeyStop, shopsWithPendingEvents } from '@/lib/db/platform'
import { pagedSweep } from '@/lib/storefront/sweeps'
import { refreshKeys } from '@/lib/queries/storefront-api'
import { refreshShop } from '@/lib/storefront/refresh'
import { processEvents } from '@/lib/orders/payment'
import { sendStaffNotices } from '@/lib/admin/staff-notices'
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
  // The Storefront API's sweeps (V1 SA1; paged in SA1b D·6): moments that write nothing then (a drop, an offer starting
  // or ending, a bar starting), and stops or starts no console action sees (a partner removed, suspended or reinstated,
  // a domain gone). The last 6 minutes (one run overlaps the next), ids only, page by page, all by a fixed moment that
  // leaves the outbox at least 20 s of its 50 (architecture review 9).
  const since = new Date(started - 6 * 60_000), until = new Date(started), sweepsBy = started + 25_000
  // A brand season starting or ending is a boundary too (one-address P1, M5): its brand lives under `settings`.
  await pagedSweep('boundaries', shopsWithBoundary, since, until, sweepsBy, async (ids) => { for (const t of ids) { refreshShop(t, 'catalogue'); refreshShop(t, 'settings') } })
  await pagedSweep('content', shopsWithContentChange, since, until, sweepsBy, async (ids) => { for (const t of ids) refreshShop(t, 'content') })
  // Keys: their cached lookups and "not found" copies live an hour, so each shop's keys are purged through its own withTenant.
  await pagedSweep('key stops', shopsWithKeyStop, since, until, sweepsBy, (ids) => eachLimited(ids, 4, (t) => refreshKeys(t)))
  // A domain gone: only the store entry (its main address, the move to the brand's website), never the catalogue.
  await pagedSweep('domains', shopsWithDomainGone, since, until, sweepsBy, async (ids) => { for (const t of ids) refreshShop(t, 'settings') })
  // Staff security emails (staff passkeys): a handful a day; their own queue, outside the shops' outbox.
  const staffMail = await sendStaffNotices().catch((e) => { console.error('[cron] staff notices', errName(e)); return 0 })
  try {
    const r = await drainOutbox(started + 50_000)
    return NextResponse.json({ ...r, events, staffMail })
  } catch (e) {
    console.error('[cron] drain', errName(e))
    return NextResponse.json({ error: 'drain' }, { status: 500 })
  }
}
