'use server'

import { headers } from 'next/headers'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'

// ENTRY POINT credential: none needed — it only asks Supabase to email a link
// to the address given; access is decided by requireMember after sign-in.
const Email = z.object({ email: z.email() })

export async function sendMagicLink(_: unknown, form: FormData): Promise<{ sent: boolean; error?: string }> {
  const parsed = Email.safeParse({ email: form.get('email') })
  if (!parsed.success) return { sent: false, error: 'Enter a valid email address' }
  try {
    const supabase = await createServerSupabase()
    const origin = `https://${(await headers()).get('host')}`
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data.email,
      options: { emailRedirectTo: `${origin}/auth/callback`, shouldCreateUser: true },
    })
    if (error) throw error
    return { sent: true }
  } catch (err) {
    console.error('[sendMagicLink]', err)
    return { sent: false, error: 'We could not send the link. Try again in a minute.' }
  }
}
