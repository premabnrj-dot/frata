import 'server-only'
import { randomInt } from 'node:crypto'
import { sql } from 'drizzle-orm'
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server'
import { db } from './index'
import { confirmedRecently, type PartnerIdentity, type PartnerOk } from '@/lib/auth/require-partner'
import { tokenHash } from '@/lib/auth/staff-cookie'
import { enrolCodeHash, passkeyCeremony, type PasskeySite, type PasskeyStore, type Result, type StoredKey, type Who } from '@/lib/auth/webauthn'
import type { PartnerGate } from '@/domains/auth/gate-state'
import { CONFIRM_AGAIN, CONFIRM_FIRST } from '@/domains/partners/passkeys'
import { passkeyProvider } from '@/domains/auth/passkey-providers'

// =============================================================================
// FILE: src/lib/db/partner-passkeys.ts — PARTNER PEOPLE'S PASSKEYS (T1b; docs/specs/2026-11-15-partner-login.md). The
// one module that calls the app_partner_pk_* definers (drizzle/0129) as frata_app. The ceremony is the shared one in
// src/lib/auth/webauthn.ts; this is its partner store and the partner-only steps (request, approve, decline, remove,
// list). Before a check the caller holds a PartnerIdentity (never a PartnerOk); after it, a PartnerOk.
// =============================================================================

export type { Result }
export type { PartnerGate }

const SAYS: Record<string, string> = {
  too_many: 'Too many tries. Wait 10 minutes and try again.',
  no_passkey: 'No passkey yet. Ask for one first.',
  not_allowed: 'Adding a passkey needs an approval first.',
  no_challenge: 'That took too long. Try again.',
  replay: 'Not confirmed. Try again, or use your other passkey.',
  duplicate: 'This passkey is already added.',
  too_many_passkeys: 'You have 10 passkeys. Delete one first.',
  bad_name: 'Not added. Try again.',
  not_owner: 'Only the partner owner can do that.',
  not_partner: 'You’re no longer on a partner team. Ask the partner owner.',
  confirm_first: CONFIRM_FIRST,
  confirm_again: CONFIRM_AGAIN,
  own_request: 'Someone else must approve your request.',
  bad_code: 'That code doesn’t match. Ask them to read it again.',
  no_person: 'That person left your team. Refresh the page.',
  no_request: 'That request has ended. Ask them for a new code.',
  in_use: 'Sign in with another passkey to delete this one.',
  not_found: 'That passkey is already gone.',
}
const one = async <T>(q: ReturnType<typeof sql>): Promise<T> => (await db().execute<{ r: T }>(q))[0]!.r
const who = (p: PartnerIdentity | PartnerOk): Who | null => (p.sessionId ? { userId: p.userId, sessionId: p.sessionId } : null)
const codeHash = (code: string) => enrolCodeHash('partner-enrol', code)
const stepupOf = (p: PartnerIdentity | PartnerOk) => ('stepup' in p ? p.stepup : null)

const store: PasskeyStore = {
  credentials: (w) => one(sql`select app_partner_pk_credentials(${w.userId}::uuid) as r`),
  challenge: async (w, purpose, stepup, challenge) => { await db().execute(sql`select app_partner_pk_challenge(${w.userId}::uuid, ${w.sessionId}::uuid, ${purpose}, ${stepup}, ${challenge})`) },
  take: (w, purpose, challenge, credential) => one<StoredKey | { ok: true } | null>(sql`select app_partner_pk_take_challenge(${w.userId}::uuid, ${w.sessionId}::uuid, ${purpose}, ${challenge}, ${credential}) as r`),
  confirm: async (w, challenge, passkeyId, counter, hash) => { await db().execute(sql`select app_partner_pk_confirm(${w.userId}::uuid, ${w.sessionId}::uuid, ${challenge}, ${passkeyId}::uuid, ${counter}, ${hash})`) },
  add: (w, stepup, credential, publicKey, counter, transports, name) => one<string>(sql`select app_partner_pk_add(${w.userId}::uuid, ${w.sessionId}::uuid, ${stepup},
      ${credential}, ${publicKey}, ${counter}, ${transports}::text[], ${name}) as r`),
}
const ceremony = passkeyCeremony({ rpName: 'Frrata Partners', tag: 'partner-passkeys', says: SAYS, tokenHash, store, nameFor: passkeyProvider })
const run = ceremony.run
const signInAgain = { ok: false as const, error: 'Sign in again.' }
const fresh = (p: PartnerOk): Result<never> | null => (confirmedRecently(p) ? null : { ok: false, error: CONFIRM_AGAIN })
const refuse = (code: string) => Object.assign(new Error(code), { cause: { message: code } })

/** What the gate shows: confirm, ask, wait, declined, or add. Null: sign in again (no session id). */
export async function gateState(p: PartnerIdentity | PartnerOk): Promise<PartnerGate | null> {
  const w = who(p)
  return w ? one<PartnerGate | null>(sql`select app_partner_pk_state(${w.userId}::uuid, ${w.sessionId}::uuid) as r`) : null
}

export async function confirmOptions(p: PartnerIdentity | PartnerOk, site: PasskeySite): Promise<Result<unknown>> {
  const w = who(p)
  return w ? ceremony.confirmOptions(w, site) : signInAgain
}
/** Checks the browser's answer and makes the 12-hour check. Returns the cookie's token (the database keeps its hash). */
export async function confirmVerify(p: PartnerIdentity | PartnerOk, response: AuthenticationResponseJSON, site: PasskeySite): Promise<Result<string>> {
  const w = who(p)
  return w ? ceremony.confirmVerify(w, response, site) : signInAgain
}
/** "Create a passkey": with this session's approved request, or a check in the last 5 minutes (another device). The
 *  user handle is the partner membership's id, so a passkey never stands for the person's staff or shop sign-in. */
export async function addOptions(p: PartnerIdentity | PartnerOk, site: PasskeySite): Promise<Result<unknown>> {
  const w = who(p)
  return w ? ceremony.addOptions(w, p.email, new TextEncoder().encode(`partner:${p.partner.memberId}`), stepupOf(p), site) : signInAgain
}
/** Stored under its password manager's name when the authenticator says which ("Google Password Manager"), else `name`. */
export async function addVerify(p: PartnerIdentity | PartnerOk, response: RegistrationResponseJSON, name: string, site: PasskeySite): Promise<Result<{ id: string; name: string }>> {
  const w = who(p)
  return w ? ceremony.addVerify(w, stepupOf(p), response, name, site) : signInAgain
}

/** "Ask Pia to call you": a 6-digit code this session shows (15 minutes; an owner's own recovery opens after 24 hours).
 *  `device` and `city` are context for the approver only. */
export async function requestPasskey(p: PartnerIdentity | PartnerOk, device: string | null, city: string | null):
  Promise<Result<{ code: string; expiresAt: string; opensAt: string | null }>> {
  const w = who(p)
  if (!w) return signInAgain
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  return run('request', async () => {
    const r = await one<{ expiresAt: string; opensAt: string | null }>(sql`select app_partner_pk_request(${w.userId}::uuid, ${w.sessionId}::uuid, ${codeHash(code)}, ${device}, ${city}) as r`)
    return { code, expiresAt: r.expiresAt, opensAt: r.opensAt ?? null }
  })
}

/** The owner approves a Lead's request with the code the Lead reads out; a check in the last 5 minutes. */
export async function approveRequest(p: PartnerOk, memberId: string, code: string): Promise<Result<string>> {
  const again = fresh(p)
  if (again) return again
  // A wrong code comes back null (the definer keeps its counted try); it reads as "doesn't match".
  return run('approve', async () => {
    const r = await one<string | null>(sql`select app_partner_pk_approve(${p.userId}::uuid, ${p.sessionId}::uuid, ${p.stepup}, ${memberId}::uuid, ${codeHash(code)}) as r`)
    if (r === null) throw refuse('bad_code')
    return r
  })
}

/** "Decline request": the owner did not start the call, or doesn't know the device. */
export async function declineRequest(p: PartnerOk, memberId: string): Promise<Result<null>> {
  return run('decline', async () => { await db().execute(sql`select app_partner_pk_decline(${p.userId}::uuid, ${p.sessionId}::uuid, ${p.stepup}, ${memberId}::uuid)`); return null })
}

/** Delete one of your own passkeys (never the one this session used); a check in the last 5 minutes. */
export async function removePasskey(p: PartnerOk, passkeyId: string): Promise<Result<null>> {
  const again = fresh(p)
  if (again) return again
  return run('remove', async () => { await db().execute(sql`select app_partner_pk_remove(${p.userId}::uuid, ${p.sessionId}::uuid, ${p.stepup}, ${passkeyId}::uuid)`); return null })
}

/** A lost device: the owner deletes every passkey of a Lead and signs them out everywhere. Returns how many. */
export async function removeAllPasskeys(p: PartnerOk, memberId: string): Promise<Result<number>> {
  const again = fresh(p)
  if (again) return again
  return run('remove all', () => one<number>(sql`select app_partner_pk_remove_all(${p.userId}::uuid, ${p.sessionId}::uuid, ${p.stepup}, ${memberId}::uuid) as r`))
}

export type MyPasskey = { id: string; name: string; createdAt: string; lastUsedAt: string | null; inUse: boolean }
/** The person's own passkeys: names and dates only, never a key, credential id or counter. */
export async function myPasskeys(p: PartnerOk): Promise<MyPasskey[]> {
  return one<MyPasskey[]>(sql`select app_partner_pk_list(${p.userId}::uuid, ${p.sessionId}::uuid, ${p.stepup}) as r`)
}

/** Sign-out ends this browser's partner check first (by its cookie's hash). */
export async function endPartnerStepup(hash: string): Promise<void> {
  await db().execute(sql`select app_partner_pk_signout(${hash})`)
}
