'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { EMAIL_LINK_TYPES } from '@/domains/auth/email-link'
import { destinationAfterSignIn } from '@/lib/auth/after-sign-in'
import { createServerSupabase } from '@/lib/supabase/server'
import { errName } from '@/lib/log'

// ENTRY POINT credential: the one-time token hash Supabase put in the sign-in email (Send Email Hook, src/app/api/auth/
// send-email). Exchanged only when the person presses "Sign in" on /auth/confirm, never when the link opens: an email
// scanner that follows the link uses nothing (partner sign-in research lesson 7; mockup screen 4). Works in any browser.

const Link = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{20,200}$/), type: z.enum(EMAIL_LINK_TYPES) })

export async function confirmLinkAction(form: FormData): Promise<void> {
  const parsed = Link.safeParse({ token: form.get('token'), type: form.get('type') })
  if (!parsed.success) redirect('/login?link=other-browser')
  let to = '/login?link=other-browser'
  try {
    const supabase = await createServerSupabase()
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: parsed.data.token, type: parsed.data.type })
    if (!error && data.user) to = await destinationAfterSignIn(data.user.id)
    else console.error('[auth/confirm]', errName(error))
  } catch (err) {
    console.error('[auth/confirm]', errName(err))
  }
  redirect(to)
}
