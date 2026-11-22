import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { deviceCodeApprove, deviceCodeClaim, deviceCodePeek, deviceCodeStart, deviceCodeUnclaim } from '@/lib/db/device-codes'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'
import { withTenant } from '@/lib/db/tenant'
import { CONSOLE_HOST } from '@/lib/public-env'
import { mintBuildKey } from './build-keys'
import { holds } from '@/domains/tenancy/roles'
import { DEVICE_CONFIRM_FRESH_MS, DEVICE_POLL_SECONDS, deviceCodeOf, deviceKeyName, newDeviceCode, newDeviceSecret } from '@/domains/storefront-api/device'
import { errName } from '@/lib/log'

// =============================================================================
// FILE: src/lib/storefront-api/device.ts — A DEVELOPER'S DEVICE SIGN-IN FOR A BUILD KEY (Studio plan G·3; ADR-0018's
// build-key amendment, point 1; Studio spec § 10). The server parts only: the confirm page (Settings › Developer)
// waits for its mockup (orchestrator ruling B1, 2026-11-22), and calls confirmDeviceCode when it lands.
//
//   start   (the CLI, no sign-in)  → a device secret for the CLI and a code for the person; stored as sha256s, 10 minutes.
//   look    (the person, signed in)  → the store the code names, if they hold api.manage there (the page shows it).
//   confirm (the person, a passkey check in the last 5 minutes) → binds the code to them and the store the CLI named,
//            only with api.manage there; limited per person; the store's audit row in the same transaction.
//   poll    (the CLI, its secret)  → pending, or the confirmed sign-in claimed ONCE: mintBuildKey as that person
//            (purpose developer, 24 hours), the key in the answer once, never stored, logged or shown again.
// Every limit fails closed. No answer says whether a store, a code or a person exists.
// =============================================================================

const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const bytes = (n: number) => new Uint8Array(randomBytes(n))

export type Started = { device: string; code: string; verify: string; expiresAt: string; interval: number }
/** The CLI starts a sign-in for `slug` from network `ip`. Null: over the network's limit. */
export async function startDeviceSignIn(slug: string, ip: string): Promise<Started | null> {
  if (!(await withinLimit(LIMITS.deviceStartIp, ip, new Date(), true))) return null
  const device = newDeviceSecret(bytes), code = newDeviceCode(bytes)
  const expiresAt = await deviceCodeStart(sha(device), sha(code), slug)
  return { device, code, verify: `https://${CONSOLE_HOST}/console/settings/developer`, expiresAt, interval: DEVICE_POLL_SECONDS }
}

/** What the confirm page shows before the person confirms: the store the CLI named, if they may make a key there. */
export type CodeFor = { storeName: string } | 'bad_code' | 'not_found' | 'not_allowed'
export async function deviceCodeFor(userId: string, typed: string): Promise<CodeFor> {
  const code = deviceCodeOf(typed)
  if (!code) return 'bad_code'
  const peek = await deviceCodePeek(userId, sha(code))
  if (!peek) return 'not_found'
  return holds(peek.role, 'api.manage') ? { storeName: peek.storeName } : 'not_allowed'
}

export type Confirmed = 'ok' | 'check_again' | 'bad_code' | 'busy' | 'not_found' | 'not_allowed'
/**
 * The person confirms the code their CLI shows. `who` is the signed-in person and when their passkey last checked: the
 * page's guard derives both from the session, never the request. The store is the one the CLI named, never one the
 * page sends; the person must hold `api.manage` there (mintBuildKey's rule), checked before anything is written. The
 * approval and the store's audit row are one transaction (the definer).
 */
export async function confirmDeviceCode(who: { userId: string; email: string; confirmedAt: Date | null }, typed: string, now: Date): Promise<Confirmed> {
  if (!who.confirmedAt || now.getTime() - who.confirmedAt.getTime() > DEVICE_CONFIRM_FRESH_MS) return 'check_again'
  const code = deviceCodeOf(typed)
  if (!code) return 'bad_code'
  if (!(await withinLimit(LIMITS.deviceConfirmPerson, who.userId, now, true))) return 'busy'
  const peek = await deviceCodePeek(who.userId, sha(code))
  if (!peek) return 'not_found'
  if (!holds(peek.role, 'api.manage')) return 'not_allowed'
  return (await deviceCodeApprove(who.userId, sha(code), who.email)) ? 'ok' : 'not_found'
}

export type Polled = { status: 'pending' } | { status: 'ok'; key: string; expiresAt: string } | { status: 'busy' } | { status: 'refused' } | null
/** The CLI's poll with its secret. Null: unknown, past its 10 minutes or already claimed (one answer for all). */
export async function pollDeviceSignIn(device: string, ip: string): Promise<Polled> {
  const hash = sha(device)
  const now = new Date() // clock-ok: server, a limit window
  if (!(await withinLimit(LIMITS.devicePollIp, ip, now, true)) || !(await withinLimit(LIMITS.devicePollDevice, hash, now, true))) return { status: 'busy' }
  const claim = await deviceCodeClaim(hash)
  if (!claim) return null
  if (claim.state === 'pending') return { status: 'pending' }
  let minted: Awaited<ReturnType<typeof mintBuildKey>> | null = null
  try {
    minted = await withTenant(claim.tenantId, (tx) => mintBuildKey(tx, { tenantId: claim.tenantId, userId: claim.userId, email: claim.email, role: claim.role, support: false },
      { purpose: 'developer', name: deviceKeyName(claim.email) }))
  } catch (err) {
    console.error('[device] mint', errName(err))
  }
  if (minted?.ok) return { status: 'ok', key: minted.key, expiresAt: minted.expiresAt }
  // Refused for good (the person may not make keys there): the claim stays spent (security LOW-8). Anything else (the
  // store's limit or ceiling, a failure): given back while live, so the CLI's next poll tries again (impact review).
  if (minted && minted.why === 'not_allowed') return { status: 'refused' }
  await deviceCodeUnclaim(hash).catch((e) => console.error('[device] unclaim', errName(e)))
  return { status: 'busy' }
}
