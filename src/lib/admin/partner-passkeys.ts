import 'server-only'
import { sql } from 'drizzle-orm'
import { adminDb } from '@/lib/db/admin'
import { confirmedRecently, type StaffOk } from '@/lib/auth/require-staff'
import { enrolCodeHash, dbCodeOf } from '@/lib/auth/webauthn'
import { errName } from '@/lib/log'

// =============================================================================
// FILE: src/lib/admin/partner-passkeys.ts — Admin's side of partner passkeys (T1b; drizzle/0129): a partner OWNER's
// first or lost passkey is approved by a Frrata admin who called the phone on the partner's record and heard the code;
// a lost device ends with deleting every passkey of the owner. Admins only, with a staff passkey check in the last 5
// minutes (the definers re-check both). Nothing here returns a key or a code hash.
// =============================================================================

export type Proof = { sessionId: string; hash: string }
export type OwnerPasskeys = {
  owner: string; phone: string; passkeys: number; lastUsedAt: string | null
  request: { createdAt: string; approved: boolean; opensAt: string | null; expiresAt: string; device: string | null; city: string | null } | null
} | null

const SAYS: Record<string, string> = {
  not_admin: 'Only a master admin can do that.',
  confirm_first: 'Confirm with your passkey first.',
  no_person: 'This partner has no owner to approve.',
  own_request: 'Another Frrata admin must approve your request.',
  bad_code: 'That code doesn’t match. Check it, or wait until the request opens.',
  too_many: 'Too many tries. Wait 10 minutes and try again.',
}
const fail = (err: unknown, what: string) => {
  const code = dbCodeOf(err)
  if (!SAYS[code]) console.error('[admin partner passkeys]', what, errName(err))
  return { ok: false as const, error: SAYS[code] ?? 'We couldn’t save that. Nothing changed. Try again.' }
}

export async function ownerPasskeys(staff: StaffOk, proof: Proof, partnerId: string): Promise<OwnerPasskeys> {
  const rows = await adminDb().execute<{ r: OwnerPasskeys }>(sql`select admin_partner_pk_state(${staff.userId}::uuid, ${proof.sessionId}::uuid, ${proof.hash}, ${partnerId}::uuid) as r`)
  return rows[0]?.r ?? null
}

export async function approveOwnerRequest(staff: StaffOk, proof: Proof, partnerId: string, code: string): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  if (staff.role !== 'admin') return { ok: false, error: SAYS.not_admin! }
  if (!confirmedRecently(staff)) return { ok: false, error: SAYS.confirm_first! }
  try {
    const rows = await adminDb().execute<{ r: string | null }>(sql`select admin_partner_pk_approve(${staff.userId}::uuid, ${proof.sessionId}::uuid, ${proof.hash}, ${partnerId}::uuid, ${enrolCodeHash('partner-enrol', code)}) as r`)
    const email = rows[0]?.r ?? null
    return email ? { ok: true, email } : { ok: false, error: SAYS.bad_code! }
  } catch (err) { return fail(err, 'approve') }
}

export async function deleteOwnerPasskeys(staff: StaffOk, proof: Proof, partnerId: string): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  if (staff.role !== 'admin') return { ok: false, error: SAYS.not_admin! }
  if (!confirmedRecently(staff)) return { ok: false, error: SAYS.confirm_first! }
  try {
    const rows = await adminDb().execute<{ r: number }>(sql`select admin_partner_pk_remove_all(${staff.userId}::uuid, ${proof.sessionId}::uuid, ${proof.hash}, ${partnerId}::uuid) as r`)
    return { ok: true, count: Number(rows[0]?.r ?? 0) }
  } catch (err) { return fail(err, 'remove all') }
}
