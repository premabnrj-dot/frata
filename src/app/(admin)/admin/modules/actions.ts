'use server'

import { z } from 'zod'
import { MODULE_KEYS } from '@/domains/modules/registry'
import { moduleName, pauseModule, resumeModule } from '@/lib/admin/modules'
import { ADMIN_ONLY, requireStaff } from '@/lib/auth/require-staff'
import type { ActionResult } from '@/components/ui/action-form'

const refusal = (reason: string) => (reason === 'signed_out' ? 'Sign in again.' : reason === 'needs_passkey' ? 'Confirm it\'s you with your passkey first.' : 'Only an admin can pause or resume a module.')

export async function pauseModuleAction(form: FormData): Promise<ActionResult> {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return { error: refusal(staff.reason) }
  const p = z.object({ module: z.enum(MODULE_KEYS), reason: z.string().trim().min(3).max(200) }).safeParse(Object.fromEntries(form))
  if (!p.success) return { fields: { reason: 'Say why, in a few words.' } }
  const ok = await pauseModule(staff, p.data.module, p.data.reason)
  return ok ? { ok: `${moduleName(p.data.module)} paused for every shop.` } : { error: 'It is already paused.' }
}

export async function resumeModuleAction(form: FormData): Promise<ActionResult> {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return { error: refusal(staff.reason) }
  const p = z.object({ module: z.enum(MODULE_KEYS) }).safeParse(Object.fromEntries(form))
  if (!p.success) return { error: 'That form was incomplete. Nothing was changed.' }
  const ok = await resumeModule(staff, p.data.module, new Date())
  return ok ? { ok: `${moduleName(p.data.module)} running again. Held messages go out with the next send.` } : { error: 'It was not paused.' }
}
