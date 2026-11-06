import 'server-only'
import { auditEvents, type MemberRole } from '@/lib/db/schema'
import { withTenant } from '@/lib/db/tenant'
import type { Tx } from '@/lib/db'
import { requireMember, type MemberResult } from './require-member'

// =============================================================================
// FILE: src/lib/auth/as-member.ts
//
// EVERY CONSOLE WRITE GOES THROUGH HERE (check:actions). It checks the member,
// opens the tenant transaction, runs the work, and — when the person is Frata
// support on a visit — writes the audit row in the SAME transaction, so a
// support change can never land without its record (owner call 2, ADR-0007).
// =============================================================================

type Ok = Extract<MemberResult, { ok: true }>

export async function asMember<T>(
  allowed: readonly MemberRole[],
  what: { action: string; target?: string; detail?: object },
  work: (tx: Tx, auth: Ok) => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  const auth = await requireMember(allowed)
  if (!auth.ok) return { ok: false, error: auth.message }
  const value = await withTenant(auth.membership.tenantId, async (tx) => {
    const result = await work(tx, auth)
    if (auth.membership.supportSessionId) {
      await tx.insert(auditEvents).values({
        tenantId: auth.membership.tenantId,
        actorUserId: auth.userId,
        actorEmail: auth.email,
        actorKind: 'support',
        supportSessionId: auth.membership.supportSessionId,
        action: what.action,
        target: what.target ?? null,
        detail: what.detail ?? null,
      })
    }
    return result
  })
  return { ok: true, value }
}
