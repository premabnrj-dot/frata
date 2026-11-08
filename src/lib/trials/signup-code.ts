import 'server-only'
import { createHmac, randomInt } from 'node:crypto'
import { FRRATA_WA_PHONE_NUMBER_ID, FRRATA_WA_SIGNUP_TEMPLATE, FRRATA_WA_TEMPLATE_LANG, FRRATA_WA_TOKEN, TRIAL_CLAIM_SECRET } from '@/lib/env'
import { signupCodeIssue, signupCodeVerify } from '@/lib/db/platform'
import { sendAuthCode } from '@/lib/meta/graph'
import { claimKey } from './claims'

// =============================================================================
// FILE: src/lib/trials/signup-code.ts — THE WHATSAPP CODE AT SIGN-UP (trials TR1; tenancy finding R2). A 6-digit code
// to an Indian WhatsApp number, from Frrata's own number. Only keyed HMACs are stored (signup_codes, definers only);
// the code lives in memory until sent. Sent at once from the request (the row is the ADR-0006 record; a sign-up has
// no tenant for the outbox). Off until Frrata's number and template exist (the three FRRATA_WA_* and TRIAL_CLAIM_SECRET set).
// =============================================================================

export const signupCodeOn = () => !!(FRRATA_WA_PHONE_NUMBER_ID && FRRATA_WA_TOKEN && FRRATA_WA_SIGNUP_TEMPLATE && TRIAL_CLAIM_SECRET)

/** A 10-digit Indian mobile number, or null. */
export function indianMobile(input: string): string | null {
  const d = String(input ?? '').replace(/\D/g, '').replace(/^(?:91|0)(?=\d{10}$)/, '')
  return /^[6-9]\d{9}$/.test(d) ? d : null
}

const codeHmac = (uid: string, code: string) => createHmac('sha256', TRIAL_CLAIM_SECRET).update(`code:${uid}:${code}`).digest('hex')

/** Issues and sends a code; the code row's id, or null when it could not be sent. */
export async function sendCode(uid: string, mobile: string): Promise<string | null> {
  const phone = claimKey('phone', mobile)
  if (!signupCodeOn() || !phone) return null
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const id = await signupCodeIssue(uid, phone.hmac, codeHmac(uid, code), phone.version)
  if (!id) return null
  return (await sendAuthCode(FRRATA_WA_TOKEN, FRRATA_WA_PHONE_NUMBER_ID, `91${mobile}`, FRRATA_WA_SIGNUP_TEMPLATE, FRRATA_WA_TEMPLATE_LANG, code)) ? id : null
}

export async function checkCode(uid: string, id: string, code: string): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false
  return signupCodeVerify(uid, id, codeHmac(uid, code))
}
