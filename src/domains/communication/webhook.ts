// =============================================================================
// FILE: src/domains/communication/webhook.ts — one Meta POST into the items Frrata stores, one row each.
// (Architecture review 2026-11-07, BLOCKER: one POST batches many items, and a status reuses its message's
// wamid, so the key carries the status: delivered and read for one message are two rows.)
// Pure: the route verifies the signature, routes each item to a shop by its own id, and stores it.
// =============================================================================

export type WaRoute = { by: 'number'; id: string } | { by: 'account'; id: string }
export type WaItem = {
  route: WaRoute
  field: string
  /** Our key without the shop: "<route id>:<field>:<item>" (the route adds "whatsapp:<tenant>:"). */
  key: string | null
  /** Item-less changes (account, quality, name updates) are keyed by a digest of their value, computed by the caller. */
  digest: boolean
  value: unknown
}

const META_ID = /^[0-9]{5,20}$/
const WAMID = /^[A-Za-z0-9._=:+/-]{8,200}$/
const STATUS = /^[a-z_]{3,20}$/
type Obj = Record<string, unknown>
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null)
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** Fields routed by the number they are about; everything else by the account (entry.id). */
const BY_NUMBER = new Set(['messages', 'smb_message_echoes', 'history', 'smb_app_state_sync'])

export function splitWebhook(body: unknown): WaItem[] {
  const b = obj(body)
  if (!b || b.object !== 'whatsapp_business_account') return []
  const out: WaItem[] = []
  for (const e of arr(b.entry)) {
    const entry = obj(e)
    const account = str(entry?.id)
    for (const c of arr(entry?.changes)) {
      const change = obj(c)
      const field = str(change?.field)
      const value = obj(change?.value)
      if (!field || !/^[a-z_]{2,60}$/.test(field) || !value) continue
      const number = str(obj(value.metadata)?.phone_number_id)
      const route: WaRoute | null = BY_NUMBER.has(field) && META_ID.test(number) ? { by: 'number', id: number }
        : !BY_NUMBER.has(field) && META_ID.test(account) ? { by: 'account', id: account } : null
      if (!route) continue
      if (field === 'messages') {
        for (const m of arr(value.messages)) {
          const id = str(obj(m)?.id)
          if (WAMID.test(id)) out.push({ route, field, key: `${route.id}:message:${id}`, digest: false, value: { metadata: value.metadata, contacts: value.contacts, message: m } })
        }
        for (const s of arr(value.statuses)) {
          const id = str(obj(s)?.id), st = str(obj(s)?.status)
          if (WAMID.test(id) && STATUS.test(st)) out.push({ route, field, key: `${route.id}:status:${id}:${st}`, digest: false, value: { metadata: value.metadata, status: s } })
        }
        continue
      }
      if (field === 'smb_message_echoes') {
        for (const m of arr(value.message_echoes)) {
          const id = str(obj(m)?.id)
          if (WAMID.test(id)) out.push({ route, field, key: `${route.id}:echo:${id}`, digest: false, value: { metadata: value.metadata, echo: m } })
        }
        continue
      }
      out.push({ route, field, key: null, digest: true, value })
    }
  }
  return out
}

/** Changes that are about the account's health: Frrata reads the number's health again when one arrives. */
export const HEALTH_FIELDS = new Set(['account_update', 'phone_number_quality_update', 'phone_number_name_update', 'account_review_update', 'business_capability_update'])
