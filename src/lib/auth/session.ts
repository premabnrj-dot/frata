import 'server-only'
import { cache } from 'react'
import { createServerSupabase } from '@/lib/supabase/server'
import { accessFor } from '@/lib/db/platform'

// =============================================================================
// FILE: src/lib/auth/session.ts — WHO IS SIGNED IN, AND WHAT THEY MAY REACH: once per request, shared by
// requireMember and requireStaff. Admin's layout asks both, so each used to ask Supabase and app_access_for on its own:
// two Auth round trips and two access queries per page (speed review 2026-11-11 MED 2). Always getUser(), which asks
// Supabase, never getSession(), which trusts the cookie.
// =============================================================================

export const signedInUser = cache(async () => {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})

/** Keyed on the user id (a string: `cache` compares it by value). */
export const accessOf = cache(accessFor)
