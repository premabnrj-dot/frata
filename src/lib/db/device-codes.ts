import 'server-only'
import { sql } from 'drizzle-orm'
import { db } from './index'
import type { StoredKey } from '@/lib/auth/webauthn'

// G·3: a developer's device sign-in (drizzle/0160, 0162). The table has no grant to any role: these definers are the only
// door. Hashes only (sha256 hex of the CLI's device secret, of the code the person types and of the network it started
// from); never the secret, the code or an address. The page's definers take the partner session as every workspace
// definer does (app_partner_need) and decide who may give a key themselves (a Partner owner or an assigned Lead).
export type PartnerSession = { userId: string; sessionId: string; stepup: string }

/** A new sign-in for a store slug, 10 minutes. The same answer whatever the slug names. */
export async function deviceCodeStart(deviceHash: string, codeHash: string, slug: string, netHash: string | null): Promise<string> {
  const rows = await db().execute<{ at: Date | string }>(sql`select app_device_code_start(${deviceHash}, ${codeHash}, ${slug}, ${netHash}) as at`)
  return new Date(rows[0]!.at).toISOString()
}

export type CodeLook = { store: string; startedAt: string; sameNetwork: boolean | null; full: boolean; hasPasskey: boolean }
/** Check code: the dialog's facts for the person's own live code on a client store; null for any other code. */
export async function deviceCodeLook(p: PartnerSession, codeHash: string, netHash: string | null): Promise<CodeLook | null> {
  const rows = await db().execute<{ r: CodeLook | null }>(sql`select app_device_code_look(${p.userId}::uuid, ${p.sessionId}::uuid, ${p.stepup}, ${codeHash}, ${netHash}) as r`)
  return rows[0]?.r ?? null
}
/** The person's own passkey ids and transports (the partner gate's definer), so the browser offers only theirs. */
export async function deviceCredentials(userId: string): Promise<{ id: string; transports: string[] }[]> {
  const rows = await db().execute<{ r: { id: string; transports: string[] }[] | null }>(sql`select app_partner_pk_credentials(${userId}::uuid) as r`)
  return rows[0]?.r ?? []
}
/** Give key, the passkey challenge made for this one code. */
export async function deviceCodeChallenge(p: PartnerSession, codeHash: string, challenge: string, netHash: string | null, mine: boolean): Promise<void> {
  await db().execute(sql`select app_device_code_challenge(${p.userId}::uuid, ${p.sessionId}::uuid, ${p.stepup}, ${codeHash}, ${challenge}, ${netHash}, ${mine})`)
}
/** Marks the challenge taken (once) and gives back this person's key for the credential; null otherwise. */
export async function deviceCodeTake(p: PartnerSession, codeHash: string, challenge: string, credential: string): Promise<StoredKey | null> {
  const rows = await db().execute<{ r: StoredKey | null }>(sql`select app_device_code_take(${p.userId}::uuid, ${p.sessionId}::uuid, ${codeHash}, ${challenge}, ${credential}) as r`)
  return rows[0]?.r ?? null
}
/** After the signature is verified: the approval, the counter and the store's audit row. Returns the store's name. */
export async function deviceCodeGive(p: PartnerSession, codeHash: string, challenge: string, passkeyId: string, counter: number): Promise<string> {
  const rows = await db().execute<{ r: string }>(sql`select app_device_code_give(${p.userId}::uuid, ${p.sessionId}::uuid, ${p.stepup}, ${codeHash}, ${challenge}, ${passkeyId}::uuid, ${counter}) as r`)
  return rows[0]!.r
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
/** A claim whose mint could not finish is given back while the code is live (the CLI's next poll tries again). */
export async function deviceCodeUnclaim(deviceHash: string): Promise<void> {
  await db().execute(sql`select app_device_code_unclaim(${deviceHash})`)
}

export type MyComputer = { id: string; store: string; createdAt: string; expiresAt: string }
/** Your computers: the person's own live developer keys on their partner's client stores. */
export async function myComputers(p: PartnerSession): Promise<MyComputer[]> {
  const rows = await db().execute<{ r: MyComputer[] }>(sql`select app_partner_developer_keys(${p.userId}::uuid, ${p.sessionId}::uuid, ${p.stepup}) as r`)
  return rows[0]?.r ?? []
}
/** Delete key: revokes the person's own developer key at once. False when it is gone already or never theirs. */
export async function deleteMyComputer(p: PartnerSession, keyId: string): Promise<boolean> {
  const rows = await db().execute<{ r: boolean }>(sql`select app_partner_developer_key_delete(${p.userId}::uuid, ${p.sessionId}::uuid, ${p.stepup}, ${keyId}::uuid) as r`)
  return rows[0]?.r === true
}
