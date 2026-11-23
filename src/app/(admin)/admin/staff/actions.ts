'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { sendStaffNotices } from '@/lib/admin/staff-notices'
import { z } from 'zod'
import { STAFF_ROLES } from '@/lib/db/schema'
import { addStaff, removeStaff } from '@/lib/admin/staff'
import { setPasskeysOff } from '@/lib/admin/passkeys'
import { staffProof } from '@/lib/auth/session'
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

/** Admin › Staff's switch (owner 2026-11-23, docs/mockups/2026-11-23-admin-passkeys-switch.html): an Admin turns passkeys
 *  off for everyone, after their own passkey confirms (the database asks for it in the last 5 minutes), or back on. */
export async function setPasskeysAction(off: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return { ok: false, error: staff.message }
  if (typeof off !== 'boolean') return { ok: false, error: 'We couldn’t save that. Nothing changed. Try again.' }
  const r = await setPasskeysOff(staff, await staffProof(staff.userId), off)
  revalidatePath('/admin', 'layout')
  return r.ok ? { ok: true } : { ok: false, error: r.error }
}

/** The banner's and the row's "Turn passkeys on" (a plain form: no passkey needed to turn them on). */
export async function turnPasskeysOnAction(): Promise<void> {
  await setPasskeysAction(false)
}
