import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { createServerSupabase } from '@/lib/supabase/server'
import { accessFor } from '@/lib/db/platform'
import { staffCookieName, tokenHash } from './staff-cookie'

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

/**
 * This browser's Supabase session id, from verified claims: getUser() (the session still exists) then getClaims() on
 * a client, requiring `sub` to be the same person. Null when either is missing. Staff passkeys bind to it.
 */
export const sessionIdOf = cache(async (userId: string): Promise<string | null> => {
  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getClaims().catch(() => ({ data: null }))
  const c = data?.claims as { sub?: string; session_id?: string } | undefined
  return c?.sub === userId && typeof c.session_id === 'string' && /^[0-9a-f-]{36}$/i.test(c.session_id) ? c.session_id : null
})

/** The staff step-up this request carries: the cookie's hash, and the session it must belong to. Null without one. */
export const staffProof = cache(async (userId: string): Promise<{ sessionId: string; hash: string } | null> => {
  const token = (await cookies()).get(staffCookieName())?.value
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null
  const sessionId = await sessionIdOf(userId)
  return sessionId ? { sessionId, hash: tokenHash(token) } : null
})

/** Keyed on the user id (a string: `cache` compares it by value). The step-up, when present, joins the same query:
 *  a support visit and staff access count only with a live one (ADR-0007 amended 2026-11-12). */
export const accessOf = cache(async (userId: string) => {
  const proof = await staffProof(userId)
  return accessFor(userId, proof?.sessionId ?? null, proof?.hash ?? null)
})
