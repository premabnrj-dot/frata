import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import type { Build, Membership } from '@/lib/db/platform'
import { accessOf, signedInUser } from './session'
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
      /** Stores this person builds for a partner (T1c): for the switcher only; never a membership. */
      builds: Build[]
    }
  | { ok: false; reason: 'not_configured' | 'signed_out' | 'no_access' | 'builder'; message: string }

/** The store this request acts in, chosen once among everything the person may open (T1c): a membership, or a store
 *  they build for a partner. requireMember answers for the first; requireCapability for both. */
export type StoreChoice =
  | { kind: 'member'; result: Extract<MemberResult, { ok: true }> }
  | { kind: 'builder'; userId: string; email: string | null; build: Build; all: Membership[]; builds: Build[]; staffRole: StaffRole | null }
  | { kind: 'none'; result: Extract<MemberResult, { ok: false }> }

import { BUILDER_REFUSED } from '@/domains/tenancy/roles'
export { BUILDER_REFUSED }

/**
 * Who is signed in and which store they act in: once per request. Takes no argument, because `cache` keys on the
 * argument's identity and every role tuple is a different array (speed review P7: each tuple used to ask the auth
 * server and the database again).
 */
export const currentStore = cache(async (): Promise<StoreChoice> => {
  if (!isAuthConfigured() || !isDatabaseConfigured()) {
    return { kind: 'none', result: { ok: false, reason: 'not_configured', message: 'Frrata is not connected yet' } }
  }
  const user = await signedInUser()
  if (!user) return { kind: 'none', result: { ok: false, reason: 'signed_out', message: 'Not signed in' } }

  const access = await accessOf(user.id)
  const wanted = (await cookies()).get(TENANT_COOKIE)?.value
  // The cookie selects among BOTH lists, so a Builder's store never falls through to another store (architecture review).
  const build = access.builds.find((b) => b.tenantId === wanted)
  const member = access.memberships.find((m) => m.tenantId === wanted)
  const first = [...access.memberships.map((m) => ({ name: m.tenantName, m })), ...access.builds.map((b) => ({ name: b.tenantName, b }))]
    .sort((x, y) => x.name.localeCompare(y.name))[0]
  const pickBuild = build ?? (!member && first && 'b' in first ? first.b : undefined)
  const email = user.email ?? null
  if (pickBuild) return { kind: 'builder', userId: user.id, email, build: pickBuild, all: access.memberships, builds: access.builds, staffRole: access.staffRole }
  const membership = member ?? access.memberships[0]
  if (!membership) return { kind: 'none', result: { ok: false, reason: 'no_access', message: 'You do not have access to this store' } }
  return { kind: 'member', result: { ok: true, userId: user.id, email, membership, all: access.memberships, staffRole: access.staffRole, builds: access.builds } }
})

/** One log line per request when a Builder meets a page that isn't theirs: ids only, never an email or a path's query. */
const noteBuilderRefused = cache((tenantId: string, userId: string) => { console.warn('[builder refused]', `tenant=${tenantId}`, `user=${userId}`) })

const currentAccess = async (): Promise<MemberResult> => {
  const c = await currentStore()
  if (c.kind === 'member') return c.result
  if (c.kind === 'none') return c.result
  noteBuilderRefused(c.build.tenantId, c.userId)
  return { ok: false, reason: 'builder', message: BUILDER_REFUSED }
}

export async function requireMember(allowed: readonly MemberRole[]): Promise<MemberResult> {
  const a = await currentAccess()
  if (a.ok && !allowed.includes(a.membership.role)) {
    return { ok: false, reason: 'no_access', message: 'You do not have access to this store' }
  }
  return a
}

export { ANY_MEMBER, CAN_BUILD, CAN_MANAGE, CAN_SET_COSTS } from '@/domains/tenancy/roles'
