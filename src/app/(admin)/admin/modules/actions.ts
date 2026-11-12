'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { MODULE_KEYS } from '@/domains/modules/registry'
import { moduleName, pauseModule, resumeModule } from '@/lib/admin/modules'
import { ADMIN_ONLY, requireStaff } from '@/lib/auth/require-staff'

const back = (k: 'ok' | 'error', m: string) => `/admin/modules?${k}=${encodeURIComponent(m)}`

export async function pauseModuleAction(form: FormData) {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) redirect(back('error', staff.reason === 'signed_out' ? 'Sign in again.' : staff.reason === 'needs_passkey' ? 'Confirm it\'s you with your passkey first.' : 'Only an admin can pause or resume a module.'))
  const p = z.object({ module: z.enum(MODULE_KEYS), reason: z.string().trim().min(3).max(200) }).safeParse(Object.fromEntries(form))
  if (!p.success) redirect(back('error', 'Say why, in a few words.'))
  const ok = await pauseModule(staff, p.data.module, p.data.reason)
  redirect(ok ? back('ok', `${moduleName(p.data.module)} paused for every shop.`) : back('error', 'It is already paused.'))
}

export async function resumeModuleAction(form: FormData) {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) redirect(back('error', staff.reason === 'signed_out' ? 'Sign in again.' : staff.reason === 'needs_passkey' ? 'Confirm it\'s you with your passkey first.' : 'Only an admin can pause or resume a module.'))
  const p = z.object({ module: z.enum(MODULE_KEYS) }).safeParse(Object.fromEntries(form))
  if (!p.success) redirect(back('error', 'That form was incomplete. Nothing was changed.'))
  const ok = await resumeModule(staff, p.data.module, new Date())
  redirect(ok ? back('ok', `${moduleName(p.data.module)} running again. Held messages go out with the next send.`) : back('error', 'It was not paused.'))
}
