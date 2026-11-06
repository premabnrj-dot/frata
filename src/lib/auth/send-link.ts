import 'server-only'
import { headers } from 'next/headers'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Emails a sign-in link that returns to this deployment's /auth/callback.
 * Used by the login page and by Admin when it adds a merchant's owner.
 * Supabase's built-in sender allows only a few emails an hour (frata-gotchas).
 */
export async function sendSignInLink(email: string): Promise<{ sent: true } | { sent: false; error: string }> {
  try {
    const supabase = await createServerSupabase()
    const origin = `https://${(await headers()).get('host')}`
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${origin}/auth/callback`, shouldCreateUser: true },
    })
    if (error) throw error
    return { sent: true }
  } catch (err) {
    console.error('[sendSignInLink]', err)
    const limited = err instanceof Error && /rate limit/i.test(err.message)
    return { sent: false, error: limited ? 'Too many sign-in emails in the last hour. Try again later.' : 'We could not send the link. Try again in a minute.' }
  }
}
