import { NextResponse } from 'next/server'
import { readCapped } from '@/lib/http/capped'
import { fetchWithTimeout } from '@/lib/http/timeout'
import { verifySns } from '@/lib/email/sns'
import { eventRow } from '@/lib/email/events'
import { storeSesEvent } from '@/lib/db/email'
import { errName } from '@/lib/log'

// ENTRY POINT credential: an SNS message signed by AWS (SignatureVersion 2) from OUR topic only, checked field by
// field before anything is fetched (src/lib/email/sns.ts; ADR-0011; scripts/check-actions.mjs). 256 kB cap. The event
// is routed only by our message id (tag m) through app_store_ses_event, and stored trimmed: type, id, bounce kind,
// time, and for a permanent bounce or a complaint the per-shop address hash — never the address, headers or the
// diagnostic text. A failure after a good signature answers 500 (SNS retries only 5xx/429).
export const dynamic = 'force-dynamic'
export const maxDuration = 60
const LIMIT = 256 * 1024
export async function POST(request: Request) {
  const body = await readCapped(request, LIMIT)
  if (body === null) return new NextResponse(null, { status: 413 })
  const v = await verifySns(body, request.headers.get('x-amz-sns-message-type'), new Date())
  if (!v.ok) return new NextResponse(null, { status: 403 })
  const m = v.message
  try {
    if (m.Type === 'SubscriptionConfirmation') {
      const r = await fetchWithTimeout(m.SubscribeURL!, { redirect: 'manual' }, 10_000)
      return new NextResponse(null, { status: r.ok ? 200 : 502 })
    }
    if (m.Type !== 'Notification') return new NextResponse(null, { status: 200 })
    const row = eventRow(m.MessageId.replace(/[^A-Za-z0-9-]/g, '').slice(0, 80), m.Message)
    if (row) await storeSesEvent(row)
    return new NextResponse(null, { status: 200 })
  } catch (e) {
    console.error('[ses webhook]', errName(e))
    return new NextResponse(null, { status: 500 })
  }
}
