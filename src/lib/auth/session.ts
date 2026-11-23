import 'server-only'
import { AsyncLocalStorage } from 'node:async_hooks'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { createServerSupabase } from '@/lib/supabase/server'
import { accessFor } from '@/lib/db/platform'
import { staffCookieName, tokenHash } from './staff-cookie'
import { partnerCookieName } from './partner-cookie'

// =============================================================================
// FILE: src/lib/auth/session.ts — WHO IS SIGNED IN, AND WHAT THEY MAY REACH: once per request, shared by
// requireMember and requireStaff. Admin's layout asks both, so each used to ask Supabase and app_access_for on its own:
// two Auth round trips and two access queries per page (speed review 2026-11-11 MED 2). Always getUser(), which asks
// Supabase, never getSession(), which trusts the cookie.
// =============================================================================

/** Outside a render React's cache does not dedupe (a route handler, a server action), so a door that asks several of
 *  the checks below asked Supabase and app_access_for once per check. Inside `oncePerCall` each runs once per argument
 *  (speed review of the Studio phase, MED-4: requireStudio asked app_access_for three times on every poll). */
const calls = new AsyncLocalStorage<Map<string, Promise<unknown>>>()
export const oncePerCall = <T>(work: () => Promise<T>): Promise<T> => (calls.getStore() ? work() : calls.run(new Map(), work))
const once = <A extends string[], R>(name: string, fn: (...a: A) => Promise<R>) => (...a: A): Promise<R> => {
  const m = calls.getStore()
  if (!m) return fn(...a)
  const k = [name, ...a].join('\u0000')
  let p = m.get(k) as Promise<R> | undefined
  if (!p) { p = fn(...a); m.set(k, p) }
  return p
}

export const signedInUser = cache(once('user', async () => {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}))

/**
 * This browser's Supabase session id, from verified claims: getUser() (the session still exists) then getClaims() on
 * a client, requiring `sub` to be the same person. Null when either is missing. Staff passkeys bind to it.
 */
export const sessionIdOf = cache(once('session', async (userId: string): Promise<string | null> => {
  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getClaims().catch(() => ({ data: null }))
  const c = data?.claims as { sub?: string; session_id?: string } | undefined
  return c?.sub === userId && typeof c.session_id === 'string' && /^[0-9a-f-]{36}$/i.test(c.session_id) ? c.session_id : null
}))

/** The staff step-up this request carries: the cookie's hash, and the session it must belong to. Null without one. */
export const staffProof = cache(async (userId: string): Promise<{ sessionId: string; hash: string } | null> => {
  const token = (await cookies()).get(staffCookieName())?.value
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null
  const sessionId = await sessionIdOf(userId)
  return sessionId ? { sessionId, hash: tokenHash(token) } : null
})

/** The partner person's step-up this request carries (T1b): the same shape as the staff one, its own cookie. */
export const partnerProof = cache(async (userId: string): Promise<{ sessionId: string; hash: string } | null> => {
  const token = (await cookies()).get(partnerCookieName())?.value
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null
  const sessionId = await sessionIdOf(userId)
  return sessionId ? { sessionId, hash: tokenHash(token) } : null
})

/** Keyed on the user id (a string: `cache` compares it by value). Both step-ups, when present, join the same query:
 *  a support visit and staff access count only with a live staff one (ADR-0007 amended 2026-11-12); a store a person
 *  works on as a partner only with a live partner one (T1b). */
export const accessOf = cache(once('access', async (userId: string) => {
  const [staff, partner] = await Promise.all([staffProof(userId), partnerProof(userId)])
  return accessFor(userId, staff?.sessionId ?? partner?.sessionId ?? null, staff?.hash ?? null, partner?.hash ?? null)
}))
