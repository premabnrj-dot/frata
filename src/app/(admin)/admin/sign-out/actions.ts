'use server'

// =============================================================================
// FILE: src/app/(admin)/admin/sign-out/actions.ts — Sign out (the shell's account block,
// Console and Admin). It lives under Admin because ending a support visit needs
// src/lib/admin, which only Admin code may import (check:tenant, ADR-0007); the
// Console's banner imports Admin's end-visit action the same way.
//
// Who may call it: anyone signed in (requireUser). It ends a live Frrata support
// visit first, so a staffer who signs out never leaves one open (ADR-0007; the
// visit's audit row records the end), then clears the shop choice cookie and
// the Supabase session. A sign-out that cannot reach Supabase still clears the
// cookies here; the browser's session cookie is removed by signOut's own
// cookie handling.
// =============================================================================
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { endSupport } from '@/lib/admin/support'
import { requireUser } from '@/lib/auth/require-user'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'
import { TENANT_COOKIE } from '@/lib/auth/require-member'
import { createServerSupabase } from '@/lib/supabase/server'
import { endStaffStepup } from '@/lib/db/platform'
import { staffCookieName, tokenHash } from '@/lib/auth/staff-cookie'

export async function signOutAction() {
  const user = await requireUser()
  if (!user.ok) redirect('/login')
  // Nothing below may stop the sign-out: a database error is logged (its name only) and the sign-out goes on.
  const staff = await requireStaff(ANY_STAFF).catch(() => null)
  const jar = await cookies()
  // Ending the visit is tried twice: a visit left open would show in the merchant's activity as longer than it was.
  if (staff?.ok) {
    const end = () => endSupport(staff, new Date(), { by: 'sign-out' })
    await end().catch(() => end()).catch((err) => console.error('[sign-out] end support', err instanceof Error ? err.name : err))
  }
  // The staff passkey step-up ends with the sign-out (after the visit is ended, which needs it), its row first.
  const stepup = jar.get(staffCookieName())?.value
  if (stepup) await endStaffStepup(tokenHash(stepup)).catch((err) => console.error('[sign-out] step-up', err instanceof Error ? err.name : err))
  jar.delete(staffCookieName())
  jar.delete(TENANT_COOKIE)
  // This device only: signing out of a shared shop phone must not sign the person out everywhere.
  await (await createServerSupabase()).auth.signOut({ scope: 'local' }).catch((err) => console.error('[sign-out]', err instanceof Error ? err.name : err))
  redirect('/login')
}
