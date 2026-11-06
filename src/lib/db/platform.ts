import 'server-only'
import { sql } from 'drizzle-orm'
import { db } from './index'
import type { MemberRole, StaffRole } from './schema'

// =============================================================================
// FILE: src/lib/db/platform.ts
//
// THE QUESTIONS ASKED BEFORE A TENANT IS KNOWN, and nothing else — each a
// SECURITY DEFINER function (drizzle/0001, 0006) returning only its answer:
//   - which tenant does this storefront host belong to?
//   - who is this user: staff role, and which stores (memberships and live
//     support sessions) may they open?
//   - claim this user's invites (confirmed email only).
// =============================================================================

export async function tenantForHost(host: string): Promise<{ id: string; name: string } | null> {
  const rows = await db().execute<{ id: string; name: string }>(
    sql`select id, name from app_tenant_for_host(${host})`,
  )
  return rows[0] ?? null
}

export type Membership = {
  tenantId: string
  tenantName: string
  role: MemberRole
  /** Set when this access is a Frata support visit, not a membership. */
  supportSessionId: string | null
}

export type Access = { staffRole: StaffRole | null; memberships: Membership[] }

export async function accessFor(userId: string): Promise<Access> {
  const rows = await db().execute<{ a: Access }>(sql`select app_access_for(${userId}::uuid) as a`)
  const a = rows[0]?.a
  return { staffRole: a?.staffRole ?? null, memberships: a?.memberships ?? [] }
}

/** Turns this user's open invites into memberships. Returns how many. */
export async function claimInvites(userId: string): Promise<number> {
  const rows = await db().execute<{ n: number }>(sql`select app_claim_invites(${userId}::uuid) as n`)
  return Number(rows[0]?.n ?? 0)
}
