'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { sendStaffNotices } from '@/lib/admin/staff-notices'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { STAFF_ROLES } from '@/lib/db/schema'
import { addStaff, removeStaff } from '@/lib/admin/staff'
import { ADMIN_ONLY, confirmedRecently, requireStaff } from '@/lib/auth/require-staff'

const back: (q: string) => never = (q) => redirect(`/admin/staff?${q}`)

export async function addStaffAction(form: FormData) {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) back(`error=${encodeURIComponent(staff.message)}`)
  // Adding staff needs a passkey check in the last 5 minutes (staff passkeys spec; the form confirms first).
  if (!confirmedRecently(staff)) back(`error=${encodeURIComponent('Confirm with your passkey first.')}`)
  const p = z.object({ email: z.email(), role: z.enum(STAFF_ROLES) }).safeParse(Object.fromEntries(form))
  if (!p.success) back(`error=${encodeURIComponent('Enter an email and a role')}`)
  const r = await addStaff(staff, p.data.email, p.data.role)
  after(() => sendStaffNotices().then(() => undefined, () => undefined))
  revalidatePath('/admin/staff')
  back('error' in r ? `error=${encodeURIComponent(r.error)}` : `ok=${encodeURIComponent(`${p.data.email} is now staff.`)}`)
}

export async function removeStaffAction(form: FormData) {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) back(`error=${encodeURIComponent(staff.message)}`)
  if (!confirmedRecently(staff)) back(`error=${encodeURIComponent('Confirm with your passkey first.')}`)
  const id = z.uuid().safeParse(form.get('userId'))
  if (!id.success) back(`error=${encodeURIComponent('Unknown staff member')}`)
  const r = await removeStaff(staff, id.data, new Date())
  after(() => sendStaffNotices().then(() => undefined, () => undefined))
  revalidatePath('/admin/staff')
  back('error' in r ? `error=${encodeURIComponent(r.error)}` : `ok=${encodeURIComponent('Removed. Their passkeys, and any support visit they had open, have ended.')}`)
}
