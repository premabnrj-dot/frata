import 'server-only'
import { sql } from 'drizzle-orm'
import { db } from './index'

// G·3: a developer's device sign-in (drizzle/0160). The table has no grant to any role: these three definers are the
// only door. Hashes only (sha256 hex of the CLI's device secret and of the code the person types); never the secret.
/** A new sign-in for a store slug, 10 minutes. The same answer whatever the slug names. */
export async function deviceCodeStart(deviceHash: string, codeHash: string, slug: string): Promise<string> {
  const rows = await db().execute<{ at: Date | string }>(sql`select app_device_code_start(${deviceHash}, ${codeHash}, ${slug}) as at`)
  return new Date(rows[0]!.at).toISOString()
}
/** A person confirms a live, unconfirmed code for a store they hold a members row on: that store's id, or null. */
export async function deviceCodeApprove(userId: string, codeHash: string): Promise<string | null> {
  const rows = await db().execute<{ t: string | null }>(sql`select app_device_code_approve(${userId}::uuid, ${codeHash}) as t`)
  return rows[0]?.t ?? null
}
export type DeviceClaim = { state: 'pending' } | { state: 'approved'; tenantId: string; userId: string; role: string; email: string }
/** The CLI's poll: pending, or the approved sign-in claimed ONCE (with the person as a member now), or null. */
export async function deviceCodeClaim(deviceHash: string): Promise<DeviceClaim | null> {
  const rows = await db().execute<{ state: string; tenant_id: string | null; user_id: string | null; role: string | null; email: string | null }>(
    sql`select state, tenant_id, user_id, role, email from app_device_code_claim(${deviceHash})`)
  const r = rows[0]
  if (!r) return null
  if (r.state === 'pending') return { state: 'pending' }
  return r.tenant_id && r.user_id && r.role ? { state: 'approved', tenantId: r.tenant_id, userId: r.user_id, role: r.role, email: r.email ?? '' } : null
}
