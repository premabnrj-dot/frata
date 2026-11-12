'use server'

import { z } from 'zod'
import { destinationAfterSignIn } from '@/lib/auth/after-sign-in'
import { sendSignInLink } from '@/lib/auth/send-link'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'
import { clientIp } from '@/lib/http/client-ip'
import { createServerSupabase } from '@/lib/supabase/server'
import { errName } from '@/lib/log'

// ENTRY POINT credential: none needed — sendCode only asks Supabase to email a
// link and a code to the address given; verifyCode proves the person holds that
// inbox. Access is decided afterwards by requireMember/requireStaff/requireUser.
// Both are rate limited per email and per IP (src/lib/db/rate-limit.ts).

const Email = z.object({ email: z.email().max(254) })
const Code = z.object({ email: z.email().max(254), code: z.string().regex(/^\d{6}$/) })

/** `field`: the mistake is in what was typed, said at that field; without it, a refusal said as a toast (§ Feedback). */
export type SendResult = { sent: true; email: string } | { sent: false; error: string; field?: 'email' }

export async function sendCode(input: { email: string }): Promise<SendResult> {
  const parsed = Email.safeParse({ email: String(input.email ?? '').trim().toLowerCase() })
  if (!parsed.success) return { sent: false, error: 'That does not look like an email address.', field: 'email' }
  const email = parsed.data.email
  if (!(await withinLimit(LIMITS.sendCodeIp, await clientIp())) || !(await withinLimit(LIMITS.sendCodeEmail, email))) {
    return { sent: false, error: 'Too many sign-in emails in the last hour. Try again later.' }
  }
  const r = await sendSignInLink(email)
  return r.sent ? { sent: true, email } : { sent: false, error: r.error }
}

export type VerifyResult = { ok: true; to: string } | { ok: false; error: string; field?: 'code' }

export async function verifyCode(input: { email: string; code: string }): Promise<VerifyResult> {
  const parsed = Code.safeParse({ email: String(input.email ?? '').trim().toLowerCase(), code: String(input.code ?? '').trim() })
  if (!parsed.success) return { ok: false, error: 'The code is the 6 digits in the email.', field: 'code' }
  // Fails closed (security review S9): a guessed code must not get unlimited tries while the counter is down.
  if (!(await withinLimit(LIMITS.verifyCodeEmail, parsed.data.email, new Date(), true))) {
    return { ok: false, error: 'Too many tries. Ask for a new email in a few minutes.' }
  }
  try {
    const supabase = await createServerSupabase()
    const { data, error } = await supabase.auth.verifyOtp({ email: parsed.data.email, token: parsed.data.code, type: 'email' })
    if (error || !data.user) return { ok: false, error: 'That code is wrong or has expired. Check the newest email, or ask for another.', field: 'code' }
    return { ok: true, to: await destinationAfterSignIn(data.user.id) }
  } catch (err) {
    console.error('[verifyCode]', errName(err))
    return { ok: false, error: 'We could not check the code. Try again in a minute.' }
  }
}
