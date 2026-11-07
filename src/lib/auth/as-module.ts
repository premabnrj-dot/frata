import 'server-only'
import type { Tx } from '@/lib/db'
import type { MemberRole } from '@/lib/db/schema'
import { MODULES, type ModuleKey } from '@/domains/modules/registry'
import { shopModules } from '@/lib/queries/modules'
import { asMember } from './as-member'
import { requireMember, type MemberResult } from './require-member'

// =============================================================================
// FILE: src/lib/auth/as-module.ts — EVERY WRITE A MODULE MAKES GOES THROUGH HERE
// (check:actions chokepoint). It is asMember plus one question: may this shop
// use this module now (moduleAccess: granted, switched on, not paused, its
// dependencies usable)? Refused in words, never with an error code.
// =============================================================================

type Ok = Extract<MemberResult, { ok: true }>

export async function asModule<T>(
  module: ModuleKey,
  allowed: readonly MemberRole[],
  what: { action: string; target?: string; detail?: object },
  work: (tx: Tx, auth: Ok) => Promise<T>,
): Promise<{ ok: true; value: T; tenantId: string } | { ok: false; error: string }> {
  const auth = await requireMember(allowed)
  if (!auth.ok) return { ok: false, error: auth.message }
  const { access } = await shopModules(auth.membership.tenantId, new Date().toISOString())
  const a = access[module]
  if (!a.usable) {
    const name = MODULES[module].name
    const why = a.why === 'paused' ? `${name} is paused by Frrata. We're on it.`
      : a.why === 'needs' && a.needs ? `Turn on ${MODULES[a.needs].name} first.`
      : a.why === 'not_granted' ? `${name} isn't in your plan.`
      : a.why === 'next' ? `${name} is coming soon.` : `Turn on ${name} in Apps.`
    return { ok: false, error: why }
  }
  return asMember(allowed, what, work)
}
