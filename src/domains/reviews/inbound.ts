// =============================================================================
// FILE: src/domains/reviews/inbound.ts — what Meta tells Reviews, from one stored WhatsApp item (Reviews R1 6b-2).
//
// Pure. Facts: frata-integrations § Meta webhooks (checked 2026-11-09). Everything matches on Meta's ids — the
// message's wamid, the template's name and id — never on a phone: a status or a button press may carry none.
// =============================================================================

import { REVIEW_TEMPLATE, STOP_PAYLOAD } from './template'

export type Inbound =
  | { kind: 'stop'; wamid: string }
  | { kind: 'failed'; wamid: string; code: number | null }
  | { kind: 'template'; id: string | null; status: string | null; category: string | null }
  | null

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null)
const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '')
const WAMID = /^[A-Za-z0-9._=:+/-]{8,180}$/

/** Template events that mean "sendable again"; every other event stops sends until the next APPROVED. */
const SENDABLE = new Set(['APPROVED', 'REINSTATED', 'UNARCHIVED'])

export function inbound(field: string, value: unknown): Inbound {
  const v = obj(value)
  if (!v) return null
  if (field === 'messages') {
    const m = obj(v.message)
    if (m && m.type === 'button' && str(obj(m.button)?.payload) === STOP_PAYLOAD) {
      const wamid = str(obj(m.context)?.id)
      return WAMID.test(wamid) ? { kind: 'stop', wamid } : null
    }
    const s = obj(v.status)
    if (s && s.status === 'failed' && WAMID.test(str(s.id))) {
      const code = Number((Array.isArray(s.errors) ? obj(s.errors[0]) : null)?.code)
      return { kind: 'failed', wamid: str(s.id), code: Number.isFinite(code) ? code : null }
    }
    return null
  }
  if (field === 'message_template_status_update' && str(v.message_template_name) === REVIEW_TEMPLATE) {
    const ev = str(v.event).toUpperCase()
    return { kind: 'template', id: str(v.message_template_id) || null, status: ev ? (SENDABLE.has(ev) ? 'APPROVED' : ev) : null, category: str(v.message_template_category) || null }
  }
  if (field === 'template_category_update' && (str(v.message_template_name) === REVIEW_TEMPLATE || str(v.message_template_id))) {
    // A notice ("will become MARKETING in 24 h": correct_category) stops sends at once; a done change says new_category.
    const next = str(v.correct_category) || str(v.new_category)
    return next ? { kind: 'template', id: str(v.message_template_id) || null, status: null, category: next.toUpperCase() } : null
  }
  return null
}
