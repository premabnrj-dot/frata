import 'server-only'
import { cache } from 'react'
import { accessOf, sessionIdOf, signedInUser } from './session'
import { isAdminDatabaseConfigured, isDatabaseConfigured } from '@/lib/env'
import { isAuthConfigured } from '@/lib/public-env'
import type { StaffRole } from '@/lib/db/schema'

// =============================================================================
// FILE: src/lib/auth/require-staff.ts
//
// THE FIRST LINE OF EVERY ADMIN PAGE AND ACTION (ADR-0007). Never throws.
// Staff = a row in platform_staff, read through app_access_for; signing in is
// not staff. Every src/lib/admin function takes the StaffOk this returns, so
// Admin data cannot be read without passing here first.
//
// Staff passkeys (owner, 2026-11-12; ADR-0007 amended; docs/specs/2026-11-12-staff-passkeys.md): staff access needs
// a live passkey step-up on this browser session, read in the same app_access_for query. Without one the answer is
// `needs_passkey` with a StaffIdentity — a different type, accepted only by the passkey module (src/lib/admin/passkeys).
// =============================================================================

/** `confirmedAt`: when this session's passkey check was made (sensitive actions want it within 5 minutes). */
export type StaffOk = { ok: true; userId: string; email: string; role: StaffRole; sessionId: string; confirmedAt: Date }
/** Signed in and on staff, but no passkey check yet on this session: enough to run the check, nothing else. The brand
 *  keeps it from ever being passed where a StaffOk is wanted. `sessionId` null: sign in again. */
export type StaffIdentity = { readonly kind: 'staff-identity'; userId: string; email: string; role: StaffRole; sessionId: string | null }
export type StaffResult = StaffOk
  | { ok: false; reason: 'not_configured' | 'signed_out' | 'not_staff'; message: string }
  | { ok: false; reason: 'needs_passkey'; message: string; identity: StaffIdentity }

/** Within the last 5 minutes: adding or removing staff, approving a passkey request, removing a passkey. */
export const FRESH_MS = 5 * 60_000
export const confirmedRecently = (s: StaffOk, now = Date.now()) => now - s.confirmedAt.getTime() < FRESH_MS

export const ANY_STAFF = ['admin', 'support'] as const satisfies readonly StaffRole[]
export const ADMIN_ONLY = ['admin'] as const satisfies readonly StaffRole[]

/** Once per request; no argument, because `cache` keys on identity and each tuple is its own array (speed review P7). */
const currentStaff = cache(async (): Promise<StaffOk | Exclude<StaffResult, StaffOk> | { ok: 'none'; userId: string }> => {
  if (!isAuthConfigured() || !isDatabaseConfigured() || !isAdminDatabaseConfigured()) {
    return { ok: false, reason: 'not_configured', message: 'Frrata Admin is not connected yet' }
  }
  const user = await signedInUser()
  if (!user) return { ok: false, reason: 'signed_out', message: 'Not signed in' }
  const { staffRole, staffConfirmedAt } = await accessOf(user.id)
  if (!staffRole) return { ok: 'none', userId: user.id }
  const sessionId = await sessionIdOf(user.id)
  if (!staffConfirmedAt || !sessionId) {
    return { ok: false, reason: 'needs_passkey', message: 'Confirm it\'s you', identity: { kind: 'staff-identity', userId: user.id, email: user.email ?? '', role: staffRole, sessionId } }
  }
  return { ok: true, userId: user.id, email: user.email ?? '', role: staffRole, sessionId, confirmedAt: new Date(staffConfirmedAt) }
})

export async function requireStaff(allowed: readonly StaffRole[]): Promise<StaffResult> {
  const s = await currentStaff()
  if (s.ok === 'none' || (s.ok === true && !allowed.includes(s.role)) || (s.ok === false && s.reason === 'needs_passkey' && !allowed.includes(s.identity.role))) {
    return { ok: false, reason: 'not_staff', message: 'This needs Frrata staff access' }
  }
  return s
}
