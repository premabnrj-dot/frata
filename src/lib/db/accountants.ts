import 'server-only'
import { sql } from 'drizzle-orm'
import type { Tx } from '@/lib/db'
import { withTenant } from '@/lib/db/tenant'
import { errName } from '@/lib/log'

// The shop's accountant (GST plan phase 3): invited and removed only through the definers in drizzle/0072, inside the
// caller's tenant transaction (asMember CAN_INVITE_ACCOUNTANT). The definers check the caller and the shop again.

const CODES = ['wrong_shop', 'not_manager', 'bad_email', 'already_member', 'no_accountant'] as const
function code(err: unknown, tag: string): string {
  const msg = (err as { cause?: { message?: string } })?.cause?.message ?? (err instanceof Error ? err.message : '')
  const c = CODES.find((x) => msg.includes(x))
  if (!c) console.error(`[${tag}]`, errName(err))
  return c ?? 'unknown'
}
async function savepointed(tx: Tx, name: string, q: ReturnType<typeof sql>, tag: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await tx.execute(sql.raw(`savepoint ${name}`))
    await tx.execute(q)
    return { ok: true }
  } catch (err) {
    await tx.execute(sql.raw(`rollback to savepoint ${name}`))
    return { ok: false, error: code(err, tag) }
  }
}

export const inviteAccountant = (tx: Tx, tenantId: string, uid: string, email: string) =>
  savepointed(tx, 'invite_accountant', sql`select app_invite_accountant(${tenantId}::uuid, ${uid}::uuid, ${email})`, 'inviteAccountant')
export const removeAccountant = (tx: Tx, tenantId: string, uid: string, member: string) =>
  savepointed(tx, 'remove_accountant', sql`select app_remove_accountant(${tenantId}::uuid, ${uid}::uuid, ${member}::uuid)`, 'removeAccountant')
export const revokeAccountantInvite = (tx: Tx, tenantId: string, uid: string, invite: string) =>
  savepointed(tx, 'revoke_accountant', sql`select app_revoke_accountant_invite(${tenantId}::uuid, ${uid}::uuid, ${invite}::uuid)`, 'revokeAccountantInvite')

/** This shop's open accountant invites (email, expiry). */
export async function accountantInvites(tenantId: string): Promise<{ id: string; email: string; expiresAt: Date }[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute<{ id: string; email: string; expires_at: string }>(sql`select * from app_accountant_invites()`)
    return rows.map((r) => ({ id: r.id, email: r.email, expiresAt: new Date(r.expires_at) }))
  })
}
