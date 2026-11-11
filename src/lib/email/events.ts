import 'server-only'
import { suppressionHashes } from './hash'
import type { SesEventRow } from '@/lib/db/email'

// =============================================================================
// FILE: src/lib/email/events.ts — AN SES EVENT (the SNS Message) → THE TRIMMED ROW app_store_ses_event takes. The
// address is read only to hash it for that shop's suppression list, never kept or logged (security review H3).
// =============================================================================

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

