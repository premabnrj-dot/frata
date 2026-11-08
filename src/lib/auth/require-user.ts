import 'server-only'
import { cache } from 'react'
import { isAuthConfigured } from '@/lib/public-env'
import { createServerSupabase } from '@/lib/supabase/server'
import { errName } from '@/lib/log'

// =============================================================================
// FILE: src/lib/auth/require-user.ts
//
// WHO IS SIGNED IN — before they have a store. Used only where no tenant exists
// yet (creating a shop). Always getUser(), which asks Supabase, never
// getSession(), which trusts the cookie. Never throws: a page shows a panel,
// an action returns a sentence.
// =============================================================================

export type UserOk = { ok: true; userId: string; email: string }
export type UserRefusal = { ok: false; reason: 'not_configured' | 'signed_out'; message: string }

export const requireUser = cache(async (): Promise<UserOk | UserRefusal> => {
  if (!isAuthConfigured()) return { ok: false, reason: 'not_configured', message: 'Sign-in is not set up on this deployment.' }
  try {
    const supabase = await createServerSupabase()
    const { data } = await supabase.auth.getUser()
    if (!data.user?.email) return { ok: false, reason: 'signed_out', message: 'Sign in to continue.' }
    return { ok: true, userId: data.user.id, email: data.user.email }
  } catch (err) {
    console.error('[requireUser]', errName(err))
    return { ok: false, reason: 'signed_out', message: 'Sign in to continue.' }
  }
})
