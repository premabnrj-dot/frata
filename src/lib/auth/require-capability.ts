import 'server-only'
import { holds, type Capability } from '@/domains/tenancy/roles'
import { builderActor, type BuilderActor } from '@/lib/db/actor'
import type { Build, Membership } from '@/lib/db/platform'
import type { StaffRole } from '@/lib/db/schema'
import { BUILDER_REFUSED, currentStore, type MemberResult } from './require-member'

// =============================================================================
// FILE: src/lib/auth/require-capability.ts — THE BUILDER'S ONLY WAY IN (T1c, ADR-0015 § 3 "Entry points").
// The same store choice as requireMember (one cached read per request), answered by capability: a member whose role
// holds it gets today's MemberResult; a Builder whose role holds it gets an Actor (its shop's id private to
// src/lib/db/actor.ts) and the switcher's places. Only the files in BUILDER_DOORS call it (check:capabilities).
// =============================================================================

export type CapabilityResult =
  | { ok: true; kind: 'member'; auth: Extract<MemberResult, { ok: true }> }
  | { ok: true; kind: 'builder'; actor: BuilderActor; userId: string; email: string | null; store: Build; all: Membership[]; builds: Build[]; staffRole: StaffRole | null }
  | Extract<MemberResult, { ok: false }>

export async function requireCapability(cap: Capability): Promise<CapabilityResult> {
  const c = await currentStore()
  if (c.kind === 'none') return c.result
  if (c.kind === 'member') {
    if (!holds(c.result.membership.role, cap)) return { ok: false, reason: 'no_access', message: 'You do not have access to this store' }
    return { ok: true, kind: 'member', auth: c.result }
  }
  if (!holds('builder', cap)) return { ok: false, reason: 'builder', message: BUILDER_REFUSED }
  return { ok: true, kind: 'builder', actor: builderActor(c.build.tenantId), userId: c.userId, email: c.email, store: c.build, all: c.all, builds: c.builds, staffRole: c.staffRole }
}
