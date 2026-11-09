import 'server-only'
import { randomBytes } from 'node:crypto'
import { GSP_PROVIDER, VERCEL_ENV } from '@/lib/env'
import { liabilityOfJson, type Liability } from '@/domains/tax/gsp'

// =============================================================================
// FILE: src/lib/gst/gsp.ts — THE GSP CONNECTOR (GST app G2). One interface for the calls a filing makes through a GST
// Suvidha Provider: ask the portal for an OTP for the shop's username, verify it for a session, push (save) a GSTR-1,
// read its summary back, and file it with an EVC OTP. Which GSP: GSP_PROVIDER. Only "fake" exists: an in-process
// stand-in whose OTP is 575757, that reads the pushed JSON back as the portal's summary, and that is REFUSED in
// Production (gsp() returns null there whatever the variable says). A real GSP is a second implementation, after the
// contract and counsel's ECO opinion; its facts go in frata-integrations, dated.
// ⚠️ Never log a session, an OTP or a payload: they are the shop's GST login and its buyers' details.
// =============================================================================

export type GspError = 'otp_wrong' | 'otp_expired' | 'session_expired' | 'not_saved' | 'already_filed' | 'portal_down' | 'rejected'
type R<T> = ({ ok: true } & T) | { ok: false; error: GspError }

export interface Gsp {
  readonly name: string
  /** The portal texts an OTP to the shop's registered mobile. */
  requestOtp(gstin: string, username: string): Promise<R<{ txn: string }>>
  /** A session for about six hours. */
  verifyOtp(gstin: string, username: string, txn: string, otp: string): Promise<R<{ session: string; expiresAt: Date }>>
  /** Save the return on the portal (not filed: it can be saved again). */
  push(session: string, gstin: string, fp: string, json: unknown): Promise<R<{ ref: string }>>
  /** The portal's own summary of what it holds for the period. */
  summary(session: string, gstin: string, fp: string): Promise<R<{ liability: Liability }>>
  /** The EVC OTP for filing goes to the authorised signatory's mobile. */
  requestFileOtp(session: string, gstin: string, fp: string): Promise<R<object>>
  /** File: final. Returns the ARN. */
  file(session: string, gstin: string, fp: string, otp: string): Promise<R<{ arn: string }>>
}

const FAKE_OTP = '575757'
/** The fake keeps what was pushed in memory, by GSTIN and period: a test's one server process is enough. */
const saved = new Map<string, { json: unknown; filed: string | null }>()
const fake: Gsp = {
  name: 'Test GSP',
  async requestOtp() { return { ok: true, txn: `fake-txn.${randomBytes(8).toString('hex')}` } },
  async verifyOtp(_g, _u, txn, otp) {
    if (!txn.startsWith('fake-txn.')) return { ok: false, error: 'otp_expired' }
    if (otp !== FAKE_OTP) return { ok: false, error: 'otp_wrong' }
    return { ok: true, session: `fake-session.${randomBytes(16).toString('hex')}`, expiresAt: new Date(Date.now() + 6 * 3_600_000) }
  },
  async push(session, gstin, fp, json) {
    if (!session.startsWith('fake-session.')) return { ok: false, error: 'session_expired' }
    const k = `${gstin}:${fp}`
    if (saved.get(k)?.filed) return { ok: false, error: 'already_filed' }
    saved.set(k, { json, filed: null })
    return { ok: true, ref: `fake-ref.${randomBytes(6).toString('hex')}` }
  },
  async summary(session, gstin, fp) {
    if (!session.startsWith('fake-session.')) return { ok: false, error: 'session_expired' }
    const s = saved.get(`${gstin}:${fp}`)
    return s ? { ok: true, liability: liabilityOfJson(s.json) } : { ok: false, error: 'not_saved' }
  },
  async requestFileOtp(session) { return session.startsWith('fake-session.') ? { ok: true } : { ok: false, error: 'session_expired' } },
  async file(session, gstin, fp, otp) {
    if (!session.startsWith('fake-session.')) return { ok: false, error: 'session_expired' }
    if (otp !== FAKE_OTP) return { ok: false, error: 'otp_wrong' }
    const s = saved.get(`${gstin}:${fp}`)
    if (!s) return { ok: false, error: 'not_saved' }
    if (s.filed) return { ok: false, error: 'already_filed' }
    s.filed = `AA${gstin.slice(0, 2)}${fp}${randomBytes(3).toString('hex').toUpperCase()}`
    return { ok: true, arn: s.filed }
  },
}

/** The GSP this deployment files through, or null: filing is off (the switch). Never the fake in Production. */
export function gsp(): Gsp | null {
  if (GSP_PROVIDER === 'fake' && VERCEL_ENV !== 'production') return fake
  return null
}

/** What each error means to the merchant (frata-design-language § Voice). */
export const GSP_ERROR_WORDS: Record<GspError, string> = {
  otp_wrong: 'That OTP doesn’t match. Check the SMS and try again.',
  otp_expired: 'That OTP has expired. Ask for a new one.',
  session_expired: 'The GST portal signed you out. Connect again.',
  not_saved: 'The portal holds nothing for this period yet. Push it first.',
  already_filed: 'This period is already filed on the portal. A change goes in next period’s return.',
  portal_down: 'The GST portal isn’t answering. Nothing was filed; try again in a while.',
  rejected: 'The portal refused the return. Download the file and check it in the offline tool.',
}
