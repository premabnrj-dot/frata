import 'server-only'
import { holds, type Capability } from '@/domains/tenancy/roles'
import { builderActor, type BuilderActor } from '@/lib/db/actor'
import type { Build, Membership } from '@/lib/db/platform'
import type { StaffRole } from '@/lib/db/schema'
import { BUILDER_REFUSED, currentStore, type MemberResult } from './require-member'

// =============================================================================
// FILE: src/lib/auth/require-capability.ts — THE BUILDER'S ONLY WAY IN (T1c, ADR-0015 § 3 "Entry points").
// The same store choice as requireMember (one cached read per request), answered by capability: a member whose role
// holds it gets today's MemberResult; a Builder whose role holds it gets an Actor and its store's NAME — never a shop
// id a page could hand to a `(tenantId: string)` reader (tenancy audit, HIGH). The shell's switcher reads the person's
// stores through `navOf`, which only src/app/(console)/console/_builder/shell.tsx may call (check:capabilities).
// Only the files in scripts/builder-doors.json call requireCapability.
// =============================================================================

/** A Builder's switcher, opaque: what it holds is read only by `navOf`. */
export type BuilderNav = { readonly kind: 'builder-nav' }
const navs = new WeakMap<BuilderNav, { current: Build; all: Membership[]; builds: Build[] }>()
export function navOf(nav: BuilderNav) {
  const n = navs.get(nav)
  if (!n) throw new Error('not a Builder nav')
  return n
}

export type CapabilityResult =
  | { ok: true; kind: 'member'; auth: Extract<MemberResult, { ok: true }> }
  | { ok: true; kind: 'builder'; actor: BuilderActor; userId: string; email: string | null; store: { tenantName: string }; nav: BuilderNav; staffRole: StaffRole | null }
  | Extract<MemberResult, { ok: false }>

export async function requireCapability(cap: Capability): Promise<CapabilityResult> {
  const c = await currentStore()
  if (c.kind === 'none') return c.result
  if (c.kind === 'member') {
    if (!holds(c.result.membership.role, cap)) return { ok: false, reason: 'no_access', message: 'You do not have access to this store' }
    return { ok: true, kind: 'member', auth: c.result }
  }
  if (!holds('builder', cap)) return { ok: false, reason: 'builder', message: BUILDER_REFUSED }
  const nav: BuilderNav = Object.freeze({ kind: 'builder-nav' })
  navs.set(nav, { current: c.build, all: c.all, builds: c.builds })
  return { ok: true, kind: 'builder', actor: builderActor(c.build.tenantId), userId: c.userId, email: c.email, store: { tenantName: c.build.tenantName }, nav, staffRole: c.staffRole }
}
