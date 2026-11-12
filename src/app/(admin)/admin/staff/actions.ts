'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { sendStaffNotices } from '@/lib/admin/staff-notices'
import { z } from 'zod'
import { STAFF_ROLES } from '@/lib/db/schema'
import { addStaff, removeStaff } from '@/lib/admin/staff'
import { ADMIN_ONLY, confirmedRecently, requireStaff } from '@/lib/auth/require-staff'
import type { ActionResult } from '@/components/ui/action-form'

export async function addStaffAction(form: FormData): Promise<ActionResult> {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return { error: staff.message }
  // Adding staff needs a passkey check in the last 5 minutes (staff passkeys spec; the form confirms first).
  if (!confirmedRecently(staff)) return { error: 'Confirm with your passkey first.' }
  const p = z.object({ email: z.email(), role: z.enum(STAFF_ROLES) }).safeParse(Object.fromEntries(form))
  if (!p.success) return { error: 'Enter an email and a role.' }
  const r = await addStaff(staff, p.data.email, p.data.role)
  after(() => sendStaffNotices().then(() => undefined, () => undefined))
  revalidatePath('/admin/staff')
  return 'error' in r ? { error: r.error } : { ok: `${p.data.email} is now staff.` }
}

export async function removeStaffAction(form: FormData): Promise<ActionResult> {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return { error: staff.message }
  if (!confirmedRecently(staff)) return { error: 'Confirm with your passkey first.' }
  // Any Postgres uuid (an auth user id need not carry an RFC version; removeStaff checks the person exists).
  const id = z.guid().safeParse(form.get('userId'))
  if (!id.success) return { error: 'Unknown staff member.' }
  const r = await removeStaff(staff, id.data, new Date())
  after(() => sendStaffNotices().then(() => undefined, () => undefined))
  revalidatePath('/admin/staff')
  return 'error' in r ? { error: r.error } : { ok: 'Removed. Their passkeys, and any support visit they had open, have ended.' }
}
