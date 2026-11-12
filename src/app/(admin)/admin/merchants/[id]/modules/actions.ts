'use server'

import { z } from 'zod'
import { MODULE_KEYS, MODULES, type ModuleKey } from '@/domains/modules/registry'
import { endAddon, giveTrial, moduleName, TRIAL_DAYS } from '@/lib/admin/modules'
import { ADMIN_ONLY, requireStaff } from '@/lib/auth/require-staff'
import type { ActionResult } from '@/components/ui/action-form'

// A refusal or a broken form says so, never a silent bounce to Merchants (UX audit 2026-11-11): in a toast, on the page.
const NOT_ADMIN = 'Only an admin can change a shop’s modules.'
const refusal = (reason: string) => (reason === 'signed_out' ? 'Sign in again.' : reason === 'needs_passkey' ? 'Confirm it\'s you with your passkey first.' : NOT_ADMIN)

/** "Growth and Scale", from the registry's addOnFor (never typed twice). */
const plansFor = (k: ModuleKey) => (MODULES[k].addOnFor ?? []).map((c) => c[0]!.toUpperCase() + c.slice(1)).join(' and ')

export async function giveTrialAction(form: FormData): Promise<ActionResult> {
  const staff = await requireStaff(ADMIN_ONLY)
  const p = z.object({ tenantId: z.uuid(), module: z.enum(MODULE_KEYS) }).safeParse(Object.fromEntries(form))
  if (!staff.ok) return { error: refusal(staff.reason) }
  if (!p.success) return { error: 'That form was incomplete. Nothing was changed.' }
  const r = await giveTrial(staff, p.data.tenantId, p.data.module, new Date())
  const name = moduleName(p.data.module)
  return r === 'given' ? { ok: `${name}: ${TRIAL_DAYS}-day trial started.` }
    : { error: r === 'core' ? `${name} is in every plan.` : r === 'next' ? `${name} isn't built yet.` : r === 'off_plan' ? `${name} is for ${plansFor(p.data.module)}.` : `They already have ${name}.` }
}

export async function endAddonAction(form: FormData): Promise<ActionResult> {
  const staff = await requireStaff(ADMIN_ONLY)
  const p = z.object({ tenantId: z.uuid(), addonId: z.uuid(), module: z.enum(MODULE_KEYS) }).safeParse(Object.fromEntries(form))
  if (!staff.ok) return { error: refusal(staff.reason) }
  if (!p.success) return { error: 'That form was incomplete. Nothing was changed.' }
  const ok = await endAddon(staff, p.data.tenantId, p.data.addonId, new Date())
  return ok ? { ok: `${moduleName(p.data.module)} ended.` } : { error: 'It had already ended.' }
}
