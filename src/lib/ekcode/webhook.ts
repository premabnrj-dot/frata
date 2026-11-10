import 'server-only'
import { createHash } from 'node:crypto'
import { EKCODE_WA_PHONE_NUMBER_ID } from '@/lib/env'
import { storeEvent } from '@/lib/db/ekcode'

// =============================================================================
// FILE: src/lib/ekcode/webhook.ts — META'S DELIVERY REPORTS FOR EKCODE'S NUMBER (P1 task 5). Only statuses of EkCode's
// own number are kept, trimmed to the wamid, the status, an error code and the time (security M5; Meta terms §4.1: no
// WhatsApp data reaches a shop). Keyed by sha256(wamid|status|timestamp), so Meta's retries are stored once.
// =============================================================================

type Status = { id?: unknown; status?: unknown; timestamp?: unknown; errors?: { code?: unknown }[] }
type Change = { value?: { metadata?: { phone_number_id?: unknown }; statuses?: Status[] } }

/** The statuses worth keeping from one webhook body. Pure; exported for tests. */
export function ekcodeStatuses(body: unknown, phoneNumberId: string): { key: string; wamid: string; status: string; error: number | null; at: Date }[] {
  const out: { key: string; wamid: string; status: string; error: number | null; at: Date }[] = []
  const entries = (body as { entry?: { changes?: Change[] }[] } | null)?.entry
  if (!Array.isArray(entries) || !phoneNumberId) return out
  for (const e of entries.slice(0, 50)) for (const c of (Array.isArray(e?.changes) ? e.changes : []).slice(0, 50)) {
    const v = c?.value
    if (!v || String(v.metadata?.phone_number_id ?? '') !== phoneNumberId) continue
    for (const s of (Array.isArray(v.statuses) ? v.statuses : []).slice(0, 200)) {
      const wamid = typeof s.id === 'string' ? s.id : ''
      const status = typeof s.status === 'string' ? s.status : ''
      const ts = Number(s.timestamp)
      if (!wamid || wamid.length > 200 || !['sent', 'delivered', 'read', 'failed'].includes(status) || !Number.isFinite(ts)) continue
      const code = s.errors?.[0]?.code
      out.push({
        key: createHash('sha256').update(`${wamid}|${status}|${ts}`).digest('hex'),
        wamid, status, error: typeof code === 'number' ? code : null, at: new Date(ts * 1000),
      })
    }
  }
  return out
}

/** Stores the body's statuses; returns how many were new. */
export async function storeEkcodeWebhook(body: unknown): Promise<number> {
  let n = 0
  for (const s of ekcodeStatuses(body, EKCODE_WA_PHONE_NUMBER_ID)) if (await storeEvent(s.key, s.wamid, s.status, s.error, s.at)) n++
  return n
}

/** A request body, refused past `max` bytes before it is all read (security S13). Null when too large. */
export async function readCapped(request: Request, max: number): Promise<string | null> {
  if (Number(request.headers.get('content-length') ?? 0) > max) return null
  const reader = request.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) { await reader.cancel().catch(() => {}); return null }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}
