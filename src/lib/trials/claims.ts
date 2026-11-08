import 'server-only'
import { createHmac } from 'node:crypto'
import { TRIAL_CLAIM_SECRET } from '@/lib/env'

// =============================================================================
// FILE: src/lib/trials/claims.ts — ONE TRIAL PER BUSINESS, THE KEYS (trials TR1; tenancy findings T1, T12, R3).
// A business key (a verified email, a verified phone) is never stored: only HMAC-SHA256 under TRIAL_CLAIM_SECRET, with
// the key's version, so a rotation keeps uniqueness. Only VERIFIED values are keyed: the email from getUser(), the
// phone from a code the person verified. Without the secret there is no key, and the definer gives no trial.
// =============================================================================

export const TRIAL_CLAIM_KEY_VERSION = 1

export type ClaimKey = { hmac: string; version: number }

/** One inbox, one key (security review TR1, M1): no "+tag" on any domain; Gmail ignores dots and has two names. */
export function claimEmail(value: string): string {
  const e = value.trim().toLowerCase()
  const at = e.lastIndexOf('@')
  if (at < 1) return e
  let local = e.slice(0, at).replace(/\+.*$/, '')
  let domain = e.slice(at + 1)
  if (domain === 'googlemail.com') domain = 'gmail.com'
  if (domain === 'gmail.com') local = local.replace(/\./g, '')
  return `${local}@${domain}`
}

/** The claim key of a verified value, or null when no secret is configured (no trial: fail closed). */
export function claimKey(kind: 'email' | 'phone', value: string): ClaimKey | null {
  if (!TRIAL_CLAIM_SECRET) return null
  const v = kind === 'email' ? claimEmail(value) : value.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '')
  return { hmac: createHmac('sha256', TRIAL_CLAIM_SECRET).update(`${kind}:${v}`).digest('hex'), version: TRIAL_CLAIM_KEY_VERSION }
}
