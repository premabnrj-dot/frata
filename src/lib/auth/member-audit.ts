import 'server-only'
import type { Tx } from '@/lib/db'
import { auditEvents } from '@/lib/db/schema'

/** A member's change, in the shop's audit log (a support visit is audited by asMember instead, ADR-0007). */
export async function memberAudit(tx: Tx, auth: { userId: string; email: string | null; membership: { tenantId: string; supportSessionId: string | null } }, action: string, target?: string) {
  if (!auth.membership.supportSessionId) {
    await tx.insert(auditEvents).values({ tenantId: auth.membership.tenantId, actorUserId: auth.userId, actorEmail: auth.email, actorKind: 'member', action, target: target ?? null })
  }
}
