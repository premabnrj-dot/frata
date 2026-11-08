import 'server-only'
import { randomInt } from 'node:crypto'
import { fetchWithTimeout } from '@/lib/http/timeout'
import { META_APP_SECRET, META_GRAPH_BASE } from '@/lib/env'
import { META_APP_ID } from '@/lib/public-env'
import { META_ID_RE } from '@/domains/communication/webhook'

// =============================================================================
// FILE: src/lib/modules/communication/graph.ts — Meta's Graph API, for Messages (C1).
// Facts: frata-integrations § Meta (checked 2026-11-07). A merchant's token is passed in per call and never
// logged; nor is any body. Every call has a timeout (check:fetch). The ids Frrata stores come from these
// calls with the merchant's token, never from the browser (tenancy review: a forged id cannot claim a number).
// =============================================================================

/** The one Graph version (src/lib/meta/graph.ts); the page's SDK init uses the same. */
export { GRAPH_VERSION } from '@/lib/meta/graph'
import { GRAPH_VERSION } from '@/lib/meta/graph'
const TIMEOUT_MS = 8_000
const META_ID = META_ID_RE

type Res = { ok: true; json: Record<string, unknown> } | { ok: false; status: number; code: number | null }

async function graph(method: 'GET' | 'POST' | 'DELETE', path: string, token: string, body?: object, query?: Record<string, string>): Promise<Res> {
  const u = new URL(`${META_GRAPH_BASE}/${GRAPH_VERSION}${path}`)
  for (const [k, v] of Object.entries(query ?? {})) u.searchParams.set(k, v)
  try {
    const r = await fetchWithTimeout(u.toString(), {
      method, cache: 'no-store',
      headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }, TIMEOUT_MS)
    const json = (await r.json().catch(() => ({}))) as Record<string, unknown>
    if (!r.ok) {
      const code = (json.error as { code?: unknown } | undefined)?.code
      return { ok: false, status: r.status, code: typeof code === 'number' ? code : null }
    }
    return { ok: true, json }
  } catch {
    return { ok: false, status: 0, code: null }
  }
}

/** Meta refused the token itself (expired, removed, or the merchant took Frrata off): "Reconnect". */
const tokenRejected = (r: Res) => !r.ok && (r.status === 401 || r.code === 190)

/** The signup code from Meta's popup, for the merchant's business token. */
export async function exchangeCode(code: string): Promise<{ ok: true; token: string } | { ok: false }> {
  if (!/^[A-Za-z0-9_\-.#]{10,1024}$/.test(code)) return { ok: false }
  const r = await graph('GET', '/oauth/access_token', `${META_APP_ID}|${META_APP_SECRET}`, undefined, { client_id: META_APP_ID, client_secret: META_APP_SECRET, code })
  const token = r.ok ? r.json.access_token : null
  return typeof token === 'string' && token.length > 20 ? { ok: true, token } : { ok: false }
}

/** The WhatsApp accounts this token was granted, read from the token itself (not from what the browser said). */
export async function grantedAccounts(token: string): Promise<string[]> {
  const r = await graph('GET', '/debug_token', `${META_APP_ID}|${META_APP_SECRET}`, undefined, { input_token: token })
  if (!r.ok) return []
  const data = r.json.data as { app_id?: string; is_valid?: boolean; granular_scopes?: { scope?: string; target_ids?: string[] }[] } | undefined
  if (!data?.is_valid || (data.app_id && data.app_id !== META_APP_ID)) return []
  const ids = new Set<string>()
  for (const g of data.granular_scopes ?? []) {
    if (g.scope === 'whatsapp_business_management' || g.scope === 'whatsapp_business_messaging') for (const t of g.target_ids ?? []) if (META_ID.test(t)) ids.add(t)
  }
  return [...ids]
}

export type WaNumber = {
  id: string; displayPhone: string; verifiedName: string | null; quality: string | null; nameStatus: string | null
  limitTier: string | null; onBusinessApp: boolean; canSend: string | null
}

const asNumber = (n: Record<string, unknown>): WaNumber | null => {
  const id = String(n.id ?? '')
  if (!META_ID.test(id)) return null
  const s = (k: string) => (typeof n[k] === 'string' ? (n[k] as string) : null)
  return {
    id, displayPhone: s('display_phone_number') ?? '', verifiedName: s('verified_name'), quality: s('quality_rating'),
    // messaging_limit_tier is deprecated (checked 2026-11-07); this is its replacement.
    nameStatus: s('name_status'), limitTier: s('whatsapp_business_manager_messaging_limit'),
    onBusinessApp: n.is_on_biz_app === true,
    canSend: typeof (n.health_status as { can_send_message?: unknown } | undefined)?.can_send_message === 'string' ? (n.health_status as { can_send_message: string }).can_send_message : null,
  }
}

const NUMBER_FIELDS = 'id,display_phone_number,verified_name,quality_rating,name_status,whatsapp_business_manager_messaging_limit,platform_type,is_on_biz_app,health_status'

export async function accountNumbers(token: string, wabaId: string): Promise<WaNumber[] | 'rejected' | null> {
  if (!META_ID.test(wabaId)) return null
  const r = await graph('GET', `/${wabaId}/phone_numbers`, token, undefined, { fields: NUMBER_FIELDS })
  if (tokenRejected(r)) return 'rejected'
  if (!r.ok) return null
  return ((r.json.data as Record<string, unknown>[] | undefined) ?? []).map(asNumber).filter((n): n is WaNumber => !!n)
}

export type WaAccount = { id: string; businessId: string | null; currency: string | null }

export async function account(token: string, wabaId: string): Promise<WaAccount | 'rejected' | null> {
  if (!META_ID.test(wabaId)) return null
  // No field says "no payment method" (checked 2026-11-07): that is learnt from a send failing with 131042 (C2).
  const r = await graph('GET', `/${wabaId}`, token, undefined, { fields: 'id,currency,owner_business_info' })
  if (tokenRejected(r)) return 'rejected'
  if (!r.ok) return null
  const biz = (r.json.owner_business_info as { id?: string } | undefined)?.id
  return {
    id: wabaId, businessId: biz && META_ID.test(biz) ? biz : null,
    currency: typeof r.json.currency === 'string' ? r.json.currency : null,
  }
}

/** Frrata's app receives this account's webhooks (no body). Undone by DELETE on a disconnect; a Business app number
 *  cannot be deregistered, and a Cloud API number is left registered: the number stays the merchant's. */
export const subscribeApp = async (token: string, wabaId: string) => (await graph('POST', `/${wabaId}/subscribed_apps`, token)).ok
export const unsubscribeApp = async (token: string, wabaId: string) => (await graph('DELETE', `/${wabaId}/subscribed_apps`, token)).ok

/** A new number goes on the Cloud API with a 6-digit PIN (two-step verification). Never for a Business app number.
 *  The PIN is not stored (architecture review): a later re-register sets a new one. */
export async function registerNumber(token: string, phoneNumberId: string): Promise<boolean> {
  if (!META_ID.test(phoneNumberId)) return false
  const pin = String(randomInt(0, 1_000_000)).padStart(6, '0')
  return (await graph('POST', `/${phoneNumberId}/register`, token, { messaging_product: 'whatsapp', pin })).ok
}

/** Business app numbers (never registered): ask Meta for the contacts and the last 6 months of chats. Each sync
 *  runs once only, within 24 h of connecting (checked 2026-11-07). */
export async function startHistorySync(token: string, phoneNumberId: string): Promise<boolean> {
  if (!META_ID.test(phoneNumberId)) return false
  const a = await graph('POST', `/${phoneNumberId}/smb_app_data`, token, { messaging_product: 'whatsapp', sync_type: 'smb_app_state_sync' })
  const b = await graph('POST', `/${phoneNumberId}/smb_app_data`, token, { messaging_product: 'whatsapp', sync_type: 'history' })
  return a.ok && b.ok
}

