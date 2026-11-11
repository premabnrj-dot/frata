import { NextResponse } from 'next/server'
import { readCapped } from '@/lib/http/capped'
import { fetchWithTimeout } from '@/lib/http/timeout'
import { verifySns } from '@/lib/email/sns'
import { suppressionHashes } from '@/lib/email/hash'
import { storeSesEvent, type SesEventRow } from '@/lib/db/email'
import { errName } from '@/lib/log'

// ENTRY POINT credential: an SNS message signed by AWS (SignatureVersion 2) from OUR topic only, checked field by
// field before anything is fetched (src/lib/email/sns.ts; ADR-0011; scripts/check-actions.mjs). 256 kB cap. The event
// is routed only by our message id (tag m) through app_store_ses_event, and stored trimmed: type, id, bounce kind,
// time, and for a permanent bounce or a complaint the per-shop address hash — never the address, headers or the
// diagnostic text. A failure after a good signature answers 500 (SNS retries only 5xx/429).
export const dynamic = 'force-dynamic'
const LIMIT = 256 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

type Recipient = { emailAddress?: string }
type SesEvent = {
  eventType?: string
  mail?: { messageId?: string; timestamp?: string; destination?: string[]; tags?: Record<string, string[]> }
  bounce?: { bounceType?: string; timestamp?: string; bouncedRecipients?: Recipient[] }
  complaint?: { timestamp?: string; complainedRecipients?: Recipient[] }
  delivery?: { timestamp?: string }
  reject?: unknown
}

export function eventRow(snsId: string, raw: string): SesEventRow | null {
  let e: SesEvent
  try { e = JSON.parse(raw) as SesEvent } catch { return null }
  const type = e.eventType
  if (type !== 'Delivery' && type !== 'Bounce' && type !== 'Complaint' && type !== 'Reject') return null
  const m = e.mail?.tags?.m?.[0], t = e.mail?.tags?.t?.[0]
  if (!m || !t || !UUID.test(m) || !UUID.test(t)) return null
  const bounce = type === 'Bounce' ? (({ Permanent: 'permanent', Transient: 'transient' } as const)[e.bounce?.bounceType as 'Permanent' | 'Transient'] ?? 'undetermined') : null
  const stamp = e.delivery?.timestamp ?? e.bounce?.timestamp ?? e.complaint?.timestamp ?? e.mail?.timestamp
  const at = stamp && Number.isFinite(Date.parse(stamp)) ? new Date(stamp) : new Date()
  // The address only to hash it for this shop's own suppression list, never stored or logged.
  const suppress = type === 'Complaint' || bounce === 'permanent'
  const address = suppress ? (e.bounce?.bouncedRecipients?.[0]?.emailAddress ?? e.complaint?.complainedRecipients?.[0]?.emailAddress ?? e.mail?.destination?.[0]) : undefined
  const hash = address ? suppressionHashes(t, address)?.write ?? null : null
  const providerId = typeof e.mail?.messageId === 'string' ? e.mail.messageId.slice(0, 200) : null
  return { snsId, messageId: m, tenantTag: t, type, providerId, bounce, hash, at }
}

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
