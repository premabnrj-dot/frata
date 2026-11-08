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

/** The claim key of a verified value, or null when no secret is configured (no trial: fail closed). */
export function claimKey(kind: 'email' | 'phone', value: string): ClaimKey | null {
  if (!TRIAL_CLAIM_SECRET) return null
  const v = kind === 'email' ? value.trim().toLowerCase() : value.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '')
  return { hmac: createHmac('sha256', TRIAL_CLAIM_SECRET).update(`${kind}:${v}`).digest('hex'), version: TRIAL_CLAIM_KEY_VERSION }
}
