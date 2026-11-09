import 'server-only'
import { META_GRAPH_BASE } from '@/lib/env'
import { fetchWithTimeout } from '@/lib/http/timeout'

// =============================================================================
// FILE: src/lib/meta/graph.ts — META'S GRAPH API, THE CORE PART: the version every caller uses, and Frrata's OWN
// WhatsApp sends (trials TR1 sign-up codes). A merchant's Messages (src/lib/modules/communication/graph.ts) imports the
// version from here; core never imports the module (check:modules).
// =============================================================================

/** v26.0 (introduced 29 Jul 2026; v27.0 is newer but undated) — frata-integrations § Meta, checked 2026-11-07. */
export const GRAPH_VERSION = 'v26.0'
const META_ID = /^\d{5,20}$/

export type SendResult = { ok: true; wamid: string | null } | { ok: false; error: number | null }

/**
 * A copy-code AUTHENTICATION template from one of Frrata's OWN numbers (frata-integrations § Sign-up code, checked
 * 2026-11-08; EkCode's number too): the code fills the body and the copy-code button. `to` is E.164 digits
 * ("91XXXXXXXXXX"), built by the caller from cleanMobile() — never taken from a request. `ttlSeconds` asks Meta to
 * drop it undelivered (and not charge) after that long. Returns Meta's message id, or its error code (131026 not on
 * WhatsApp, 130429 throughput, …) — null when there was no answer at all (timeout: the outcome is unknown, ADR-0008).
 * Never logs the code or the number.
 */
export async function sendAuthCode(token: string, phoneNumberId: string, to: string, template: string, lang: string, code: string, ttlSeconds?: number): Promise<SendResult> {
  if (!META_ID.test(phoneNumberId) || !/^\d{10,15}$/.test(to) || !/^\d{4,8}$/.test(code)) return { ok: false, error: null }
  try {
    const r = await fetchWithTimeout(`${META_GRAPH_BASE}/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
      method: 'POST', cache: 'no-store',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', to, type: 'template',
        ...(ttlSeconds ? { message_send_ttl_seconds: ttlSeconds } : {}),
        template: { name: template, language: { code: lang }, components: [
          { type: 'body', parameters: [{ type: 'text', text: code }] },
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
        ] },
      }),
    }, 8_000)
    const body = (await r.json().catch(() => null)) as { messages?: { id?: string }[]; error?: { code?: number } } | null
    if (!r.ok) {
      console.error('[sendAuthCode] status', r.status)
      return { ok: false, error: typeof body?.error?.code === 'number' ? body.error.code : r.status }
    }
    const wamid = body?.messages?.[0]?.id
    return { ok: true, wamid: typeof wamid === 'string' && wamid.length <= 200 ? wamid : null }
  } catch (err) { console.error('[sendAuthCode]', err instanceof Error ? err.name : 'error'); return { ok: false, error: null } }
}
