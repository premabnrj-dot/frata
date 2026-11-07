'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { MODULE_KEYS } from '@/domains/modules/registry'
import { endAddon, giveTrial, moduleName, TRIAL_DAYS } from '@/lib/admin/modules'
import { ADMIN_ONLY, requireStaff } from '@/lib/auth/require-staff'

const back = (id: string, k: 'ok' | 'error', m: string) => `/admin/merchants/${id}/modules?${k}=${encodeURIComponent(m)}`

export async function giveTrialAction(form: FormData) {
  const staff = await requireStaff(ADMIN_ONLY)
  const p = z.object({ tenantId: z.uuid(), module: z.enum(MODULE_KEYS) }).safeParse(Object.fromEntries(form))
  if (!staff.ok || !p.success) redirect('/admin/merchants')
  const r = await giveTrial(staff, p.data.tenantId, p.data.module, new Date())
  const name = moduleName(p.data.module)
  redirect(r === 'given' ? back(p.data.tenantId, 'ok', `${name}: ${TRIAL_DAYS}-day trial started.`)
    : back(p.data.tenantId, 'error', r === 'core' ? `${name} is in every plan.` : `They already have ${name}.`))
}

export async function endAddonAction(form: FormData) {
  const staff = await requireStaff(ADMIN_ONLY)
  const p = z.object({ tenantId: z.uuid(), addonId: z.uuid(), module: z.enum(MODULE_KEYS) }).safeParse(Object.fromEntries(form))
  if (!staff.ok || !p.success) redirect('/admin/merchants')
  const ok = await endAddon(staff, p.data.tenantId, p.data.addonId, new Date())
  redirect(ok ? back(p.data.tenantId, 'ok', `${moduleName(p.data.module)} ended.`) : back(p.data.tenantId, 'error', 'It had already ended.'))
}
