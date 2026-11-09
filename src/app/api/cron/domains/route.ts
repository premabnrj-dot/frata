import { NextResponse } from 'next/server'
import { isCronRequest } from '@/lib/auth/cron'
import { domainsDue } from '@/lib/db/platform'
import { checkDomainRow, checkParkedRow } from '@/lib/domains/own-domains'
import { isOwnDomainsConfigured } from '@/lib/env'
import { errName } from '@/lib/log'
import { drainOutbox, eachLimited } from '@/lib/outbox/drain'

// ENTRY POINT credential: CRON_SECRET via isCronRequest (scripts/check-actions.mjs).
// Own domains D2·8: the background check. The database decides which rows are due (app_domains_due: every 10 min the
// first day, hourly after); the schedule only wakes this. On Hobby it wakes once a day (vercel.json), so a main domain
// turns on no 307 (plan § D·2); on Pro the schedule line changes and nothing else.

export const maxDuration = 60
const AT_ONCE = 4

export async function GET(request: Request) {
  if (!isCronRequest(request)) return new NextResponse(null, { status: 401 })
  if (!isOwnDomainsConfigured()) return NextResponse.json({ off: true })
  const started = Date.now()
  let checked = 0
  try {
    const due = await domainsDue(200)
    await eachLimited(due, AT_ONCE, async (d) => {
      if (Date.now() > started + 40_000) return // the rest are due next time
      if (d.parked) await checkParkedRow(d.tenantId, d.id)
      else await checkDomainRow(d.tenantId, d.id, { forDialog: false })
      checked++
    })
  } catch (e) { console.error('[cron] domains', errName(e)) }
  const { sent } = await drainOutbox(started + 55_000)
  return NextResponse.json({ checked, sent })
}
