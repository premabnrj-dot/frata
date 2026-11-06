'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { endSupport } from '@/lib/admin/support'
import { TENANT_COOKIE } from '@/lib/auth/require-member'
import { ANY_STAFF, requireStaff } from '@/lib/auth/require-staff'

/** "End now" on the support banner: ends the visit, clears the store selection, back to Admin. */
export async function endSupportAction() {
  const staff = await requireStaff(ANY_STAFF)
  if (!staff.ok) redirect('/console')
  const tenantId = await endSupport(staff, new Date())
  ;(await cookies()).delete(TENANT_COOKIE)
  redirect(tenantId ? `/admin/merchants/${tenantId}?ok=${encodeURIComponent('Support visit ended.')}` : '/admin/merchants')
}
