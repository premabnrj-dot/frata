import 'server-only'
import type { Tx } from '@/lib/db'
import type { MemberRole } from '@/lib/db/schema'
import { MODULES, type ModuleKey } from '@/domains/modules/registry'
import { shopModules, type ShopModules } from '@/lib/queries/modules'
import { asMember } from './as-member'
import { requireMember, type MemberResult } from './require-member'

// =============================================================================
// FILE: src/lib/auth/as-module.ts — EVERY WRITE A MODULE MAKES GOES THROUGH HERE
// (check:actions chokepoint). It is asMember plus one question: may this shop
// use this module now (moduleAccess: granted, switched on, not paused, its
// dependencies usable)? Refused in words, never with an error code.
// =============================================================================

type Ok = Extract<MemberResult, { ok: true }>

/** The words for a module this shop cannot use now (one place, read by asModule and moduleGate). */
function refusal(module: ModuleKey, a: ShopModules['access'][ModuleKey]): string {
  const name = MODULES[module].name
  return a.why === 'paused' ? `${name} is paused by Frrata. We're on it.`
    : a.why === 'needs' && a.needs ? (a.held ? `${MODULES[a.needs].name} is paused by Frrata. We're on it.` : `Turn on ${MODULES[a.needs].name} first.`)
    : a.why === 'not_granted' ? `${name} isn't in your plan.`
    : a.why === 'next' ? `${name} is coming soon.` : `Turn on ${name} in Apps.`
}

/** The same question before a module calls the outside world (Meta, Shiprocket), which never happens inside a
 *  transaction. Its write still goes through asModule, which asks again. */
export async function moduleGate(module: ModuleKey, allowed: readonly MemberRole[]): Promise<{ ok: true; auth: Ok } | { ok: false; error: string }> {
  const auth = await requireMember(allowed)
  if (!auth.ok) return { ok: false, error: auth.message }
  const a = (await shopModules(auth.membership.tenantId, new Date().toISOString())).access[module]
  return a.usable ? { ok: true, auth } : { ok: false, error: refusal(module, a) }
}

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
  if (!a.usable) return { ok: false, error: refusal(module, a) }
  return asMember(allowed, what, work)
}
