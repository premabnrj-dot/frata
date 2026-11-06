import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { createServerSupabase } from '@/lib/supabase/server'
import { membershipsFor, type Membership } from '@/lib/db/platform'
import { isDatabaseConfigured } from '@/lib/env'
import { isAuthConfigured } from '@/lib/public-env'
import type { MemberRole } from '@/lib/db/schema'

// =============================================================================
// FILE: src/lib/auth/require-member.ts
//
// THE FIRST LINE OF EVERY CONSOLE PAGE AND EVERY SERVER ACTION (from Ekatan's
// requireAuth). Never throws — callers show or return its message.
// Signing in is not access: a user with no `members` row sees nothing.
//
// ⚠️ A LAYOUT'S CHECK DOES NOT PROTECT ITS PAGES. Next renders the layout and
// the page in parallel; a layout that refuses still lets its page run (seen on
// the first deploy: /console/orders threw behind the layout's panel). So every
// page and action calls this itself, and it never throws — not even before the
// environment is configured.
// The chosen tenant comes from a cookie, and is honoured only if the user is a
// member of it; otherwise their first membership.
// =============================================================================

export const TENANT_COOKIE = 'frata_tenant'

export type MemberResult =
  | { ok: true; userId: string; email: string | null; membership: Membership; all: Membership[] }
  | { ok: false; reason: 'not_configured' | 'signed_out' | 'no_access'; message: string }

/** Cached per request: the layout and the page both call it, one auth round trip. */
export const requireMember = cache(async (allowed: readonly MemberRole[]): Promise<MemberResult> => {
  if (!isAuthConfigured() || !isDatabaseConfigured()) {
    return { ok: false, reason: 'not_configured', message: 'Frata is not connected yet' }
  }
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, reason: 'signed_out', message: 'Not signed in' }

  const all = await membershipsFor(user.id)
  const wanted = (await cookies()).get(TENANT_COOKIE)?.value
  const membership = all.find((m) => m.tenantId === wanted) ?? all[0]
  if (!membership || !allowed.includes(membership.role)) {
    return { ok: false, reason: 'no_access', message: 'You do not have access to this store' }
  }
  return { ok: true, userId: user.id, email: user.email ?? null, membership, all }
})

export const ANY_MEMBER = ['owner', 'admin', 'staff'] as const satisfies readonly MemberRole[]
export const CAN_MANAGE = ['owner', 'admin'] as const satisfies readonly MemberRole[]
