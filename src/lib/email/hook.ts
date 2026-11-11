import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { SEND_EMAIL_HOOK_SECRET } from '@/lib/env'

// =============================================================================
// FILE: src/lib/email/hook.ts — SUPABASE'S SEND EMAIL HOOK IS FROM SUPABASE (Standard Webhooks; ADR-0011). The secret is
// "v1,whsec_<base64>"; the signature is HMAC-SHA256 over "<webhook-id>.<webhook-timestamp>.<body>", sent as one or more
// space-separated "v1,<base64>" in webhook-signature. Five minutes of clock skew either way.
// =============================================================================

export function hookSigned(body: string, id: string | null, timestamp: string | null, signatures: string | null, now: Date, secret = SEND_EMAIL_HOOK_SECRET): boolean {
  const key = secret.replace(/^v1,/, '').replace(/^whsec_/, '')
  if (!key || !id || !timestamp || !signatures || !/^\d{9,11}$/.test(timestamp) || id.length > 200) return false
  if (Math.abs(now.getTime() / 1000 - Number(timestamp)) > 300) return false
  const expected = createHmac('sha256', Buffer.from(key, 'base64')).update(`${id}.${timestamp}.${body}`).digest()
  return signatures.split(' ').some((s) => {
    const [v, sig] = s.split(',')
    if (v !== 'v1' || !sig) return false
    const got = Buffer.from(sig, 'base64')
    return got.length === expected.length && timingSafeEqual(got, expected)
  })
}

export type HookPayload = {
  user?: { email?: string; new_email?: string }
  email_data?: { token?: string; token_hash?: string; redirect_to?: string; email_action_type?: string; site_url?: string; token_new?: string; token_hash_new?: string }
}
