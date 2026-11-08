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

/**
 * A copy-code AUTHENTICATION template from FRRATA's own number (frata-integrations § Sign-up code, checked 2026-11-08):
 * the code fills the body and the copy-code button. `to` is E.164 digits ("91XXXXXXXXXX"). Never logged.
 */
export async function sendAuthCode(token: string, phoneNumberId: string, to: string, template: string, lang: string, code: string): Promise<boolean> {
  if (!META_ID.test(phoneNumberId) || !/^\d{10,15}$/.test(to) || !/^\d{4,8}$/.test(code)) return false
  try {
    const r = await fetchWithTimeout(`${META_GRAPH_BASE}/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
      method: 'POST', cache: 'no-store',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', to, type: 'template',
        template: { name: template, language: { code: lang }, components: [
          { type: 'body', parameters: [{ type: 'text', text: code }] },
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
        ] },
      }),
    }, 8_000)
    return r.ok
  } catch { return false }
}
