import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { auditEvents } from '@/lib/db/schema'
import { deviceCodeApprove, deviceCodeClaim, deviceCodeStart } from '@/lib/db/device-codes'
import { LIMITS, withinLimit } from '@/lib/db/rate-limit'
import { withTenant } from '@/lib/db/tenant'
import { CONSOLE_HOST } from '@/lib/public-env'
import { mintBuildKey } from './build-keys'
import { DEVICE_CONFIRM_FRESH_MS, DEVICE_POLL_SECONDS, deviceCodeOf, deviceKeyName, newDeviceCode, newDeviceSecret } from '@/domains/storefront-api/device'
import { errName } from '@/lib/log'

// =============================================================================
// FILE: src/lib/storefront-api/device.ts — A DEVELOPER'S DEVICE SIGN-IN FOR A BUILD KEY (Studio plan G·3; ADR-0018's
// build-key amendment, point 1; Studio spec § 10). The server parts only: the confirm page (Settings › Developer)
// waits for its mockup (orchestrator ruling B1, 2026-11-22), and calls confirmDeviceCode when it lands.
//
//   start   (the CLI, no sign-in)  → a device secret for the CLI and a code for the person; stored as sha256s, 10 minutes.
//   confirm (the person, signed in, a passkey check in the last 5 minutes) → binds the code to them and the store the
//            CLI named, only if they hold a members row there; limited per person; an audit row in that store.
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

export type Confirmed = 'ok' | 'check_again' | 'bad_code' | 'busy' | 'not_found'
/**
 * The person confirms the code their CLI shows. `who` is the signed-in person and when their passkey last checked (the
 * page's guard gives both); the store is the one the CLI named, never one the page sends.
 */
export async function confirmDeviceCode(who: { userId: string; email: string; confirmedAt: Date | null }, typed: string, now: Date): Promise<Confirmed> {
  if (!who.confirmedAt || now.getTime() - who.confirmedAt.getTime() > DEVICE_CONFIRM_FRESH_MS) return 'check_again'
  const code = deviceCodeOf(typed)
  if (!code) return 'bad_code'
  if (!(await withinLimit(LIMITS.deviceConfirmPerson, who.userId, now, true))) return 'busy'
  const tenantId = await deviceCodeApprove(who.userId, sha(code))
  if (!tenantId) return 'not_found'
  await withTenant(tenantId, (tx) => tx.insert(auditEvents).values({ tenantId, actorUserId: who.userId, actorEmail: who.email, actorKind: 'member',
    action: 'build_key.device_confirmed', target: 'developer', detail: { fields: ['device'] } }))
  return 'ok'
}

export type Polled = { status: 'pending' } | { status: 'ok'; key: string; expiresAt: string } | { status: 'busy' } | { status: 'refused' } | null
/** The CLI's poll with its secret. Null: unknown, past its 10 minutes or already claimed (one answer for all). */
export async function pollDeviceSignIn(device: string): Promise<Polled> {
  const hash = sha(device)
  if (!(await withinLimit(LIMITS.devicePollDevice, hash, new Date(), true))) return { status: 'busy' }
  const claim = await deviceCodeClaim(hash)
  if (!claim) return null
  if (claim.state === 'pending') return { status: 'pending' }
  try {
    const minted = await withTenant(claim.tenantId, (tx) => mintBuildKey(tx, { tenantId: claim.tenantId, userId: claim.userId, email: claim.email, role: claim.role, support: false },
      { purpose: 'developer', name: deviceKeyName(claim.email) }))
    if (minted.ok) return { status: 'ok', key: minted.key, expiresAt: minted.expiresAt }
    return minted.why === 'busy' || minted.why === 'full' ? { status: 'busy' } : { status: 'refused' }
  } catch (err) {
    console.error('[device] mint', errName(err))
    return { status: 'busy' }
  }
}
