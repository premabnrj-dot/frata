import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import type { AuthenticationResponseJSON } from '@simplewebauthn/server'
import { deviceCodeChallenge, deviceCodeClaim, deviceCodeGive, deviceCredentials, deviceCodeLook, deviceCodeStart, deviceCodeTake, deviceCodeUnclaim, type CodeLook, type PartnerSession } from '@/lib/db/device-codes'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'
import { withTenant } from '@/lib/db/tenant'
import { CONSOLE_HOST } from '@/lib/public-env'
import { passkeyCeremony, type PasskeySite, type PasskeyStore } from '@/lib/auth/webauthn'
import { buildKeyLimitOk, buildKeyUncount, mintBuildKey } from './build-keys'
import { DEVICE_POLL_SECONDS, DEVICE_TERMINAL, DEVICE_VERIFY_PATH, deviceCodeOf, deviceKeyName, networkOf, newDeviceCode, newDeviceSecret } from '@/domains/storefront-api/device'
import { errName } from '@/lib/log'

// =============================================================================
// FILE: src/lib/storefront-api/device.ts — A DEVELOPER'S DEVICE SIGN-IN FOR A BUILD KEY (Studio plan G·3; ADR-0018's
// build-key amendment, point 1; four screens § 2, owner-approved 2026-11-22, security review folded in).
//
//   start  (the CLI, no sign-in)  → a device secret for the CLI and a code for the person; stored as sha256s with the
//          sha256 of the network it came from, 10 minutes. The answer carries the terminal's words.
//   check  (Partner workspace › Developer, the person at the terminal) → the store, when it started, whether from the
//          person's own network, whether the store has room; only for a Partner owner or an assigned Lead of the store's
//          partner (the definer decides). Limited per person a minute.
//   give   (the same person) → a passkey check made for THIS code (its challenge on the code's row; an earlier check
//          never counts, the passkeys-off switch neither), then the approval and the store's audit row in one
//          transaction, under the store's ceiling. Limited per person a minute.
//   poll   (the CLI, its secret) → pending, or the confirmed sign-in claimed ONCE: mintBuildKey as that person (purpose
//          developer, 24 hours), the key in the answer once, never stored, logged or shown again; "full" when the store
//          has its limit of keys.
// Every limit fails closed. No answer says whether a store, a code or a person exists. The code travels in a request's
// body only (a server action), never a URL.
// =============================================================================

const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const bytes = (n: number) => new Uint8Array(randomBytes(n))
const netHash = (ipBucket: string) => { const n = networkOf(ipBucket); return n ? sha(`device-net:${n}`) : null }

export type Started = { device: string; code: string; verify: string; expiresAt: string; interval: number; message: string }
/** The CLI starts a sign-in for `slug` from network `ip` (ipBucket's answer). Null: over the network's limit. */
export async function startDeviceSignIn(slug: string, ip: string): Promise<Started | null> {
  if (!(await withinLimit(LIMITS.deviceStartIp, ip, new Date(), true))) return null
  const device = newDeviceSecret(bytes), code = newDeviceCode(bytes)
  const expiresAt = await deviceCodeStart(sha(device), sha(code), slug, netHash(ip))
  const verify = `https://${CONSOLE_HOST}${DEVICE_VERIFY_PATH}`
  return { device, code, verify, expiresAt, interval: DEVICE_POLL_SECONDS, message: `${DEVICE_TERMINAL.open(verify)}\n${DEVICE_TERMINAL.code(code)}` }
}

/** Why Check code or Give key said no, as the page words it (four screens § 2 States). */
export type DeviceRefusal = 'bad_code' | 'ended' | 'busy' | 'full' | 'no_passkey' | 'not_confirmed' | 'sign_in_again'
export type Checked = { ok: true; look: CodeLook } | { ok: false; why: DeviceRefusal }

/** Check code: what the dialog shows for the code the person typed, from the network they are on now. */
export async function checkDeviceCode(p: PartnerSession, typed: string, ip: string): Promise<Checked> {
  const code = deviceCodeOf(typed)
  if (!code) return { ok: false, why: 'bad_code' }
  if (!(await withinLimit(LIMITS.deviceCheckPerson, p.userId, new Date(), true))) return { ok: false, why: 'busy' }
  try {
    const look = await deviceCodeLook(p, sha(code), netHash(ip))
    return look ? { ok: true, look } : { ok: false, why: 'ended' }
  } catch (err) {
    return { ok: false, why: refusalOf(err) }
  }
}

// The definers' refusal codes (P0001), as the page's reasons. Anything else is logged and reads as "ended" (it reveals
// nothing and asks for a new code).
const CODES: Record<string, DeviceRefusal> = {
  not_found: 'ended', no_challenge: 'not_confirmed', replay: 'not_confirmed', full: 'full', no_passkey: 'no_passkey',
  confirm_first: 'sign_in_again', confirm_again: 'sign_in_again', bad_input: 'not_confirmed',
}
function refusalOf(err: unknown): DeviceRefusal {
  const code = (err as { cause?: { message?: string } })?.cause?.message ?? ''
  if (CODES[code]) return CODES[code]
  console.error('[device] check', errName(err))
  return 'ended'
}

/** The ceremony for one code: the shared one (src/lib/auth/webauthn.ts) over the device-code definers, so its challenge
 *  is THIS code's and its "confirm" is the approval itself (no step-up is made). */
function codeCeremony(p: PartnerSession, codeHash: string, given: { store?: string }) {
  const store: PasskeyStore = {
    credentials: (w) => deviceCredentials(w.userId),
    challenge: (_w, _purpose, _stepup, challenge) => deviceCodeChallenge(p, codeHash, challenge),
    take: (_w, _purpose, challenge, credential) => deviceCodeTake(p, codeHash, challenge, credential),
    confirm: async (_w, challenge, passkeyId, counter) => { given.store = await deviceCodeGive(p, codeHash, challenge, passkeyId, counter) },
    add: async () => { throw Object.assign(new Error('not_allowed'), { cause: { message: 'not_allowed' } }) },
  }
  // `says` maps each refusal code to itself, so the caller gets the code back and words it (the store's name included).
  const says = Object.fromEntries(Object.keys(CODES).map((k) => [k, k]))
  return passkeyCeremony({ rpName: 'Frrata Partners', tag: 'device-give', says, tokenHash: (t) => t, store })
}
const asRefusal = (error: string): DeviceRefusal => CODES[error] ?? 'not_confirmed'

/** Give key, step 1: the options the browser signs, a challenge for this code alone. */
export async function giveOptions(p: PartnerSession, typed: string, site: PasskeySite): Promise<{ ok: true; options: unknown } | { ok: false; why: DeviceRefusal }> {
  const code = deviceCodeOf(typed)
  if (!code) return { ok: false, why: 'bad_code' }
  if (!(await withinLimit(LIMITS.deviceGivePerson, p.userId, new Date(), true))) return { ok: false, why: 'busy' }
  const r = await codeCeremony(p, sha(code), {}).confirmOptions({ userId: p.userId, sessionId: p.sessionId }, site)
  return r.ok ? { ok: true, options: r.value } : { ok: false, why: asRefusal(r.error) }
}

/** Give key, step 2: the device's answer verified, then the approval. Returns the store's name. No limit of its own: it
 *  needs a challenge only giveOptions makes, and that is limited (5 a person a minute). */
export async function giveVerify(p: PartnerSession, typed: string, response: AuthenticationResponseJSON, site: PasskeySite): Promise<{ ok: true; store: string } | { ok: false; why: DeviceRefusal }> {
  const code = deviceCodeOf(typed)
  if (!code) return { ok: false, why: 'bad_code' }
  const given: { store?: string } = {}
  const r = await codeCeremony(p, sha(code), given).confirmVerify({ userId: p.userId, sessionId: p.sessionId }, response, site)
  if (!r.ok) console.error('[device] give refused', r.error) // a refusal code, never the code or the key
  return r.ok && given.store ? { ok: true, store: given.store } : { ok: false, why: r.ok ? 'not_confirmed' : asRefusal(r.error) }
}

export type Polled = { status: 'pending' } | { status: 'ok'; key: string; expiresAt: string } | { status: 'busy' } | { status: 'full' } | { status: 'refused' } | null
/** The CLI's poll with its secret. Null: unknown, past its 10 minutes or already claimed (one answer for all). */
export async function pollDeviceSignIn(device: string, ip: string): Promise<Polled> {
  const hash = sha(device)
  const now = new Date() // clock-ok: server, a limit window
  if (!(await withinLimit(LIMITS.devicePollIp, ip, now, true)) || !(await withinLimit(LIMITS.devicePollDevice, hash, now, true))) return { status: 'busy' }
  const claim = await deviceCodeClaim(hash)
  if (!claim) return null
  if (claim.state === 'pending') return { status: 'pending' }
  let minted: Awaited<ReturnType<typeof mintBuildKey>> | null = null
  let limited = false
  try {
    limited = await buildKeyLimitOk(claim.tenantId)
    minted = await withTenant(claim.tenantId, (tx) => mintBuildKey(tx, { tenantId: claim.tenantId, userId: claim.userId, email: claim.email, role: claim.role, support: false },
      { purpose: 'developer', name: deviceKeyName(claim.email), limited }))
  } catch (err) {
    console.error('[device] mint', errName(err))
  }
  if (minted?.ok) return { status: 'ok', key: minted.key, expiresAt: minted.expiresAt }
  if (limited) await buildKeyUncount(claim.tenantId) // counted, but no key came of it (impact review)
  // Refused for good (the person may not make keys there): the claim stays spent (security LOW-8). Anything else (the
  // store's limit or ceiling, a failure): given back while live, so the CLI's next poll tries again (impact review).
  if (minted && minted.why === 'not_allowed') return { status: 'refused' }
  await deviceCodeUnclaim(hash).catch((e) => console.error('[device] unclaim', errName(e)))
  // The store reached its ceiling since Give key checked it: its own answer, so the CLI can say so (four screens § 2).
  return { status: minted?.why === 'full' ? 'full' : 'busy' }
}
