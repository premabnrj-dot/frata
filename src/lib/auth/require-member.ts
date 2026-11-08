import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { createServerSupabase } from '@/lib/supabase/server'
import { accessFor, type Membership } from '@/lib/db/platform'
import { isDatabaseConfigured } from '@/lib/env'
import { isAuthConfigured } from '@/lib/public-env'
import type { MemberRole, StaffRole } from '@/lib/db/schema'

// =============================================================================
// FILE: src/lib/auth/require-member.ts
//
// THE FIRST LINE OF EVERY CONSOLE PAGE AND EVERY SERVER ACTION (from Ekatan's
// requireAuth). Never throws — callers show or return its message.
// Signing in is not access: a user with no membership and no live support
// session sees nothing. The tenant comes from app_access_for; the
// `frata_tenant` cookie only SELECTS among what it returned (ADR-0007).
//
// ⚠️ A LAYOUT'S CHECK DOES NOT PROTECT ITS PAGES. Next renders the layout and
// the page in parallel; every page and action calls this itself. Cached per
// request, so layout + page cost one auth round trip.
// =============================================================================

export const TENANT_COOKIE = 'frata_tenant'

export type MemberResult =
  | {
      ok: true
      userId: string
      email: string | null
      membership: Membership
      all: Membership[]
      staffRole: StaffRole | null
    }
  | { ok: false; reason: 'not_configured' | 'signed_out' | 'no_access'; message: string }

/**
 * Who is signed in and which store they act in: once per request. Takes no argument, because `cache` keys on the
 * argument's identity and every role tuple is a different array (speed review P7: each tuple used to ask the auth
 * server and the database again).
 */
const currentAccess = cache(async (): Promise<MemberResult> => {
  if (!isAuthConfigured() || !isDatabaseConfigured()) {
    return { ok: false, reason: 'not_configured', message: 'Frrata is not connected yet' }
  }
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, reason: 'signed_out', message: 'Not signed in' }

  const access = await accessFor(user.id)
  const wanted = (await cookies()).get(TENANT_COOKIE)?.value
  const membership = access.memberships.find((m) => m.tenantId === wanted) ?? access.memberships[0]
  if (!membership) return { ok: false, reason: 'no_access', message: 'You do not have access to this store' }
  return { ok: true, userId: user.id, email: user.email ?? null, membership, all: access.memberships, staffRole: access.staffRole }
})

export async function requireMember(allowed: readonly MemberRole[]): Promise<MemberResult> {
  const a = await currentAccess()
  if (a.ok && !allowed.includes(a.membership.role)) {
    return { ok: false, reason: 'no_access', message: 'You do not have access to this store' }
  }
  return a
}

export { ANY_MEMBER, CAN_BUILD, CAN_MANAGE, CAN_SET_COSTS } from '@/domains/tenancy/roles'
