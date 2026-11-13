import 'server-only'
import { createHash, randomBytes, randomInt } from 'node:crypto'
import { sql } from 'drizzle-orm'
import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticationResponseJSON, type RegistrationResponseJSON,
} from '@simplewebauthn/server'
import { adminDb } from '@/lib/db/admin'
import { confirmedRecently, type StaffIdentity, type StaffOk } from '@/lib/auth/require-staff'
import { tokenHash, type PasskeySite } from '@/lib/auth/staff-cookie'
import { errName } from '@/lib/log'

// =============================================================================
// FILE: src/lib/admin/passkeys.ts — STAFF PASSKEYS (docs/specs/2026-11-12-staff-passkeys.md; ADR-0007 amended).
// The one module that calls the app_staff_* definers (drizzle/0109). Frrata checks the passkey itself with
// SimpleWebAuthn; the database holds the rules (who, which session, which purpose, once, how long). A check that
// passes returns a random token for the step-up cookie; the database keeps only its hash.
// Before a step-up the caller holds a StaffIdentity (never a StaffOk); after it, a StaffOk and its step-up proof.
// =============================================================================

export type Proof = { sessionId: string; hash: string }
type Who = { userId: string; sessionId: string }

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
export type Result<T = void> = { ok: true; value: T } | { ok: false; error: string }
const refusal = (err: unknown): string => {
  const msg = (err as { cause?: { message?: string } })?.cause?.message ?? (err instanceof Error ? err.message : '')
  return SAYS[msg] ?? 'Something went wrong. Try again.'
}
async function run<T>(what: string, fn: () => Promise<T>): Promise<Result<T>> {
  try { return { ok: true, value: await fn() } } catch (err) {
    const msg = (err as { cause?: { message?: string } })?.cause?.message ?? ''
    if (!SAYS[msg]) console.error('[passkeys]', what, errName(err))
    return { ok: false, error: refusal(err) }
  }
}
const one = async <T>(q: ReturnType<typeof sql>): Promise<T> => (await adminDb().execute<{ r: T }>(q))[0]!.r
const who = (s: StaffIdentity | StaffOk): Who | null => (s.sessionId ? { userId: s.userId, sessionId: s.sessionId } : null)
/** The challenge the browser signed, read from its clientDataJSON (the definer then checks it is this person's). */
const challengeOf = (clientDataJSON: string): string | null => {
  try { const c = JSON.parse(Buffer.from(clientDataJSON, 'base64url').toString('utf8')) as { challenge?: unknown }; return typeof c.challenge === 'string' && /^[A-Za-z0-9_-]{40,100}$/.test(c.challenge) ? c.challenge : null } catch { return null }
}
/** The 6-digit request code, as stored (never the code itself). */
const codeHash = (code: string) => createHash('sha256').update(`staff-enrol:${code.replace(/\D/g, '')}`).digest('hex')

export type GateState = { passkeys: number; request: { expiresAt: string; approved: boolean; approvedUntil: string; approvedBy: string | null } | null }
/** What the gate screen shows: confirm, ask, or add. */
export async function gateState(identity: StaffIdentity): Promise<GateState | null> {
  const w = who(identity)
  if (!w) return null
  return one<GateState | null>(sql`select app_staff_state(${w.userId}::uuid, ${w.sessionId}::uuid) as r`)
}

/** Options for "Use passkey", naming this person's own passkeys (drizzle/0111): a passkey left on the device by an
 *  earlier, unrecorded try must not be the one the browser offers. The definer still accepts only this person's. */
export async function confirmOptions(identity: StaffIdentity | StaffOk, site: PasskeySite): Promise<Result<unknown>> {
  const w = who(identity)
  if (!w) return { ok: false, error: 'Sign in again.' }
  return run('confirm options', async () => {
    const mine = await one<{ id: string; transports: string[] }[]>(sql`select app_staff_credentials(${w.userId}::uuid) as r`)
    const options = await generateAuthenticationOptions({ rpID: site.rpID, userVerification: 'required', timeout: 120_000,
      // No transports here: a passkey recorded as `internal` would otherwise be looked for on this device alone, and a
      // browser never offers "use a phone" (hybrid) or a security key for it — a synced passkey on another device then
      // fails as "Not confirmed" (owner locked out, 2026-11-13). The id list still limits it to this person's own.
      allowCredentials: mine.map((c) => ({ id: c.id })) })
    await adminDb().execute(sql`select app_staff_challenge(${w.userId}::uuid, ${w.sessionId}::uuid, 'confirm', null, ${options.challenge})`)
    return options
  })
}

/** Checks the browser's answer and makes the step-up. Returns the cookie's token. */
export async function confirmVerify(identity: StaffIdentity | StaffOk, response: AuthenticationResponseJSON, site: PasskeySite): Promise<Result<string>> {
  const w = who(identity)
  if (!w) return { ok: false, error: 'Sign in again.' }
  const challenge = challengeOf(response.response.clientDataJSON)
  if (!challenge) return { ok: false, error: SAYS.replay! }
  return run('confirm verify', async () => {
    const key = await one<{ passkeyId: string; publicKey: string; counter: number; transports: string[] } | null>(
      sql`select app_staff_take_challenge(${w.userId}::uuid, ${w.sessionId}::uuid, 'confirm', ${challenge}, ${response.id}) as r`)
    if (!key) throw Object.assign(new Error('replay'), { cause: { message: 'replay' } })
    const { rpID, origin } = site
    const v = await verifyAuthenticationResponse({
      response, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
      credential: { id: response.id, publicKey: Buffer.from(key.publicKey, 'base64url'), counter: Number(key.counter), transports: key.transports as never },
    })
    if (!v.verified) throw Object.assign(new Error('replay'), { cause: { message: 'replay' } })
    const token = randomBytes(32).toString('base64url')
    await adminDb().execute(sql`select app_staff_confirm(${w.userId}::uuid, ${w.sessionId}::uuid, ${challenge}, ${key.passkeyId}::uuid, ${v.authenticationInfo.newCounter}, ${tokenHash(token)})`)
    return token
  })
}

/** Options for "Add passkey": allowed with a live step-up on this session (a second device) or this session's
 *  approved request — the definer decides. */
export async function addOptions(identity: StaffIdentity | StaffOk, proof: Proof | null, site: PasskeySite): Promise<Result<unknown>> {
  const w = who(identity)
  if (!w) return { ok: false, error: 'Sign in again.' }
  return run('add options', async () => {
    const options = await generateRegistrationOptions({
      rpName: 'Frrata Admin', rpID: site.rpID, userName: identity.email, userID: new TextEncoder().encode(identity.userId),
      attestationType: 'none', timeout: 120_000,
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    })
    await adminDb().execute(sql`select app_staff_challenge(${w.userId}::uuid, ${w.sessionId}::uuid, 'add', ${proof?.sessionId === w.sessionId ? proof.hash : null}, ${options.challenge})`)
    return options
  })
}

export async function addVerify(identity: StaffIdentity | StaffOk, proof: Proof | null, response: RegistrationResponseJSON, name: string, site: PasskeySite): Promise<Result<string>> {
  const w = who(identity)
  if (!w) return { ok: false, error: 'Sign in again.' }
  const challenge = challengeOf(response.response.clientDataJSON)
  if (!challenge) return { ok: false, error: SAYS.no_challenge! }
  return run('add verify', async () => {
    const taken = await one<{ ok: boolean } | null>(sql`select app_staff_take_challenge(${w.userId}::uuid, ${w.sessionId}::uuid, 'add', ${challenge}, '') as r`)
    if (!taken) throw Object.assign(new Error('no_challenge'), { cause: { message: 'no_challenge' } })
    const { rpID, origin } = site
    const v = await verifyRegistrationResponse({ response, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true })
    if (!v.verified || !v.registrationInfo) throw Object.assign(new Error('no_challenge'), { cause: { message: 'no_challenge' } })
    const c = v.registrationInfo.credential
    const transports = (c.transports ?? []).filter((t) => /^[a-z-]{1,20}$/.test(t)).slice(0, 8)
    return one<string>(sql`select app_staff_add_passkey(${w.userId}::uuid, ${w.sessionId}::uuid, ${proof?.sessionId === w.sessionId ? proof.hash : null},
      ${c.id}, ${Buffer.from(c.publicKey).toString('base64url')}, ${c.counter}, ${sql.raw(`array[${transports.map((t) => `'${t}'`).join(',')}]::text[]`)}, ${name}) as r`)
  })
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
