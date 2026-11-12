import 'server-only'
import { randomInt } from 'node:crypto'
import { sql } from 'drizzle-orm'
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server'
import { adminDb } from '@/lib/db/admin'
import { confirmedRecently, type StaffIdentity, type StaffOk } from '@/lib/auth/require-staff'
import { tokenHash, type PasskeySite } from '@/lib/auth/staff-cookie'
import { enrolCodeHash, passkeyCeremony, type PasskeyStore, type Result, type StoredKey, type Who } from '@/lib/auth/webauthn'
import type { GateState } from '@/components/passkeys/types'

// =============================================================================
// FILE: src/lib/admin/passkeys.ts — STAFF PASSKEYS (docs/specs/2026-11-12-staff-passkeys.md; ADR-0007 amended).
// The one module that calls the app_staff_* definers (drizzle/0109). The ceremony itself (options, verification, the
// counter) is the shared one in src/lib/auth/webauthn.ts; this file is its staff store and the staff-only steps
// (request, approve, remove, list). A check that passes returns a random token for the step-up cookie; the database
// keeps only its hash. Before a step-up the caller holds a StaffIdentity (never a StaffOk); after it, a StaffOk.
// =============================================================================

export type Proof = { sessionId: string; hash: string }
export type { Result, GateState }

/** The reasons a definer refuses, as people read them. Anything else: "Something went wrong. Try again." */
const SAYS: Record<string, string> = {
  too_many: 'Too many tries. Wait 10 minutes and try again.',
  no_passkey: 'No passkey yet. Ask another admin to approve one for you.',
  not_allowed: 'Adding a passkey needs another admin\'s approval first.',
  no_challenge: 'That took too long. Try again.',
  replay: 'Not confirmed. Try again, or use your other passkey.',
  duplicate: 'This passkey is already added.',
  too_many_passkeys: 'You have 10 passkeys. Remove one first.',
  bad_name: 'Give the passkey a name of 1 to 40 characters.',
  not_admin: 'Only an admin can do that.',
  confirm_first: 'Confirm with your passkey first.',
  own_request: 'Another admin must approve your request.',
  bad_code: 'That code doesn\'t match an open request.',
  not_staff: 'That person is not Frrata staff.',
  in_use: 'You are signed in with this passkey. Use your other passkey, then remove it.',
  not_found: 'That passkey is already gone.',
}
const one = async <T>(q: ReturnType<typeof sql>): Promise<T> => (await adminDb().execute<{ r: T }>(q))[0]!.r
const who = (s: StaffIdentity | StaffOk): Who | null => (s.sessionId ? { userId: s.userId, sessionId: s.sessionId } : null)
const codeHash = (code: string) => enrolCodeHash('staff-enrol', code)

/** The staff side's five calls (drizzle/0109, 0111), all as frata_admin. */
const store: PasskeyStore = {
  credentials: (w) => one(sql`select app_staff_credentials(${w.userId}::uuid) as r`),
  challenge: async (w, purpose, stepup, challenge) => { await adminDb().execute(sql`select app_staff_challenge(${w.userId}::uuid, ${w.sessionId}::uuid, ${purpose}, ${stepup}, ${challenge})`) },
  take: (w, purpose, challenge, credential) => one<StoredKey | { ok: true } | null>(sql`select app_staff_take_challenge(${w.userId}::uuid, ${w.sessionId}::uuid, ${purpose}, ${challenge}, ${credential}) as r`),
  confirm: async (w, challenge, passkeyId, counter, hash) => { await adminDb().execute(sql`select app_staff_confirm(${w.userId}::uuid, ${w.sessionId}::uuid, ${challenge}, ${passkeyId}::uuid, ${counter}, ${hash})`) },
  add: (w, stepup, credential, publicKey, counter, transports, name) => one<string>(sql`select app_staff_add_passkey(${w.userId}::uuid, ${w.sessionId}::uuid, ${stepup},
      ${credential}, ${publicKey}, ${counter}, ${transports}::text[], ${name}) as r`),
}
const ceremony = passkeyCeremony({ rpName: 'Frrata Admin', tag: 'passkeys', says: SAYS, tokenHash, store })
const run = ceremony.run
const signInAgain = { ok: false as const, error: 'Sign in again.' }
const stepupOf = (w: Who, proof: Proof | null) => (proof?.sessionId === w.sessionId ? proof.hash : null)

/** What the gate screen shows: confirm, ask, or add. */
export async function gateState(identity: StaffIdentity): Promise<GateState | null> {
  const w = who(identity)
  if (!w) return null
  return one<GateState | null>(sql`select app_staff_state(${w.userId}::uuid, ${w.sessionId}::uuid) as r`)
}

export async function confirmOptions(identity: StaffIdentity | StaffOk, site: PasskeySite): Promise<Result<unknown>> {
  const w = who(identity)
  return w ? ceremony.confirmOptions(w, site) : signInAgain
}
/** Checks the browser's answer and makes the step-up. Returns the cookie's token. */
export async function confirmVerify(identity: StaffIdentity | StaffOk, response: AuthenticationResponseJSON, site: PasskeySite): Promise<Result<string>> {
  const w = who(identity)
  return w ? ceremony.confirmVerify(w, response, site) : signInAgain
}
/** Options for "Add passkey": allowed with a live step-up on this session (a second device) or this session's
 *  approved request — the definer decides. */
export async function addOptions(identity: StaffIdentity | StaffOk, proof: Proof | null, site: PasskeySite): Promise<Result<unknown>> {
  const w = who(identity)
  return w ? ceremony.addOptions(w, identity.email, new TextEncoder().encode(identity.userId), stepupOf(w, proof), site) : signInAgain
}
export async function addVerify(identity: StaffIdentity | StaffOk, proof: Proof | null, response: RegistrationResponseJSON, name: string, site: PasskeySite): Promise<Result<string>> {
  const w = who(identity)
  return w ? ceremony.addVerify(w, stepupOf(w, proof), response, name, site) : signInAgain
}

/** "Let me add a passkey": the code this session shows; another admin types it to approve (15 minutes). */
export async function requestPasskey(identity: StaffIdentity | StaffOk): Promise<Result<{ code: string; expiresAt: string }>> {
  const w = who(identity)
  if (!w) return { ok: false, error: 'Sign in again.' }
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  return run('request', async () => ({ code, expiresAt: await one<string>(sql`select app_staff_request(${w.userId}::uuid, ${w.sessionId}::uuid, ${codeHash(code)}) as r`) }))
}

/** An admin approves another person's request with the code they read out; needs a passkey check in the last 5 minutes. */
export async function approveRequest(staff: StaffOk, proof: Proof, email: string, code: string): Promise<Result<string>> {
  if (!confirmedRecently(staff)) return { ok: false, error: SAYS.confirm_first! }
  // A wrong code comes back null (the definer keeps its counted try); it reads as "doesn't match".
  return run('approve', async () => {
    const r = await one<string | null>(sql`select app_staff_approve(${staff.userId}::uuid, ${proof.sessionId}::uuid, ${proof.hash}, ${email}, ${codeHash(code)}) as r`)
    if (r === null) throw Object.assign(new Error('bad_code'), { cause: { message: 'bad_code' } })
    return r
  })
}

export async function removePasskey(staff: StaffOk, proof: Proof, passkeyId: string): Promise<Result<string>> {
  if (!confirmedRecently(staff)) return { ok: false, error: SAYS.confirm_first! }
  return run('remove', () => one<string>(sql`select app_staff_remove_passkey(${staff.userId}::uuid, ${proof.sessionId}::uuid, ${proof.hash}, ${passkeyId}::uuid) as r`))
}

export type StaffRow = { userId: string; email: string; role: 'admin' | 'support'; since: string; lastConfirmedAt: string | null
  passkeys: { id: string; name: string; createdAt: string; lastUsedAt: string | null }[]; request: { createdAt: string; approved: boolean } | null }
/** Admin › Staff: everyone (admins) or yourself (support), with passkeys and open requests — never key material. */
export async function staffWithPasskeys(staff: StaffOk, proof: Proof): Promise<StaffRow[]> {
  return one<StaffRow[]>(sql`select app_staff_list(${staff.userId}::uuid, ${proof.sessionId}::uuid, ${proof.hash}) as r`)
}
