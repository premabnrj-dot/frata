import 'server-only'
import { headers } from 'next/headers'
import { CONSOLE_HOST } from '@/lib/public-env'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Emails a sign-in link AND a 6-digit code (Supabase's Magic Link template
 * carries {{ .Token }}, docs/setup.md). The link returns to the console host —
 * never to a Host header someone else chose; on a local run, to localhost.
 * Used by sign-in, sign-up and Admin when it adds a merchant's owner.
 * Supabase's built-in sender allows only a few emails an hour (frata-gotchas):
 * a custom SMTP sender is set before sign-up is public.
 */
export async function sendSignInLink(email: string): Promise<{ sent: true } | { sent: false; error: string }> {
  try {
    const supabase = await createServerSupabase()
    const host = (await headers()).get('host') ?? ''
    const origin = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? `http://${host}` : `https://${CONSOLE_HOST}`
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${origin}/auth/callback`, shouldCreateUser: true },
    })
    if (error) throw error
    return { sent: true }
  } catch (err) {
    console.error('[sendSignInLink]', err)
    const msg = err instanceof Error ? err.message : ''
    if (/only request this after|security purposes/i.test(msg)) return { sent: false, error: 'An email was sent less than a minute ago. Wait a moment, then ask again.' }
    if (/rate limit/i.test(msg)) return { sent: false, error: 'Too many sign-in emails in the last hour. Try again later.' }
    return { sent: false, error: 'We could not send the email. Try again in a minute.' }
  }
}
