import 'server-only'
import { cache } from 'react'
import { createServerSupabase } from '@/lib/supabase/server'
import { accessFor } from '@/lib/db/platform'
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
// Staff 2FA is off for now (owner, 2026-11-06). When it is turned on, the aal2
// check goes HERE and nowhere else.
// =============================================================================

export type StaffOk = { ok: true; userId: string; email: string; role: StaffRole }
export type StaffResult = StaffOk | { ok: false; reason: 'not_configured' | 'signed_out' | 'not_staff'; message: string }

export const ANY_STAFF = ['admin', 'support'] as const satisfies readonly StaffRole[]
export const ADMIN_ONLY = ['admin'] as const satisfies readonly StaffRole[]

/** Once per request; no argument, because `cache` keys on identity and each tuple is its own array (speed review P7). */
const currentStaff = cache(async (): Promise<StaffOk | Exclude<StaffResult, StaffOk> | { ok: 'none'; userId: string }> => {
  if (!isAuthConfigured() || !isDatabaseConfigured() || !isAdminDatabaseConfigured()) {
    return { ok: false, reason: 'not_configured', message: 'Frrata Admin is not connected yet' }
  }
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, reason: 'signed_out', message: 'Not signed in' }
  const { staffRole } = await accessFor(user.id)
  if (!staffRole) return { ok: 'none', userId: user.id }
  return { ok: true, userId: user.id, email: user.email ?? '', role: staffRole }
})

export async function requireStaff(allowed: readonly StaffRole[]): Promise<StaffResult> {
  const s = await currentStaff()
  if (s.ok === 'none' || (s.ok === true && !allowed.includes(s.role))) {
    return { ok: false, reason: 'not_staff', message: 'This needs Frrata staff access' }
  }
  return s
}
