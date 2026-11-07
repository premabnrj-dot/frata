'use server'

// =============================================================================
// FILE: src/app/(admin)/admin/sign-out/actions.ts — Sign out (the shell's account block,
// Console and Admin). It lives under Admin because ending a support visit needs
// src/lib/admin, which only Admin code may import (check:tenant, ADR-0007); the
// Console's banner imports Admin's end-visit action the same way.
//
// Who may call it: anyone signed in (requireUser). It ends a live Frata support
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

export async function signOutAction() {
  const user = await requireUser()
  if (!user.ok) redirect('/login')
  const staff = await requireStaff(ANY_STAFF)
  if (staff.ok) await endSupport(staff, new Date()).catch((err) => console.error('[sign-out] end support', err instanceof Error ? err.name : err))
  ;(await cookies()).delete(TENANT_COOKIE)
  await (await createServerSupabase()).auth.signOut().catch((err) => console.error('[sign-out]', err instanceof Error ? err.name : err))
  redirect('/login')
}
