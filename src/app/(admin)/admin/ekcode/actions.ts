'use server'

import { z } from 'zod'
import { ADMIN_ONLY, requireStaff } from '@/lib/auth/require-staff'
import { ekBlockNumber, ekSetLimits, ekShopControl } from '@/lib/admin/ekcode'
import { LIMIT_BOUNDS } from '@/domains/ekcode-core/limits'
import type { ActionResult } from '@/components/ui/action-form'

const Reason = z.string().trim().min(3).max(500)

export async function shopControlAction(form: FormData): Promise<ActionResult> {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return { error: staff.message }
  const p = z.object({ tenantId: z.string().uuid(), action: z.enum(['pause', 'resume', 'raise', 'reset']), value: z.coerce.number().int().optional(), reason: Reason, shop: z.string().max(80) })
    .safeParse(Object.fromEntries(form))
  if (!p.success) return { fields: { reason: 'Say why, in a few words.' } }
  try { await ekShopControl(staff, p.data.tenantId, p.data.action, p.data.value ?? null, p.data.reason) }
  catch { return { error: 'That was refused. A raised cap is 20 to 20,000 a day.' } }
  const done = { pause: 'paused', resume: 'running again', raise: 'cap raised', reset: 'breaker reset' }[p.data.action]
  return { ok: `EkCode ${done} for ${p.data.shop}.` }
}

export async function limitsAction(form: FormData): Promise<ActionResult> {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return { error: staff.message }
  const num = (k: string) => Number(form.get(k))
  const limits = {
    perNumber10m: num('perNumber10m'), perNumberDay: num('perNumberDay'), triesPerCode: num('triesPerCode'), perNetworkHour: num('perNetworkHour'),
    perWideNetworkHour: num('perWideNetworkHour'), globalHour: num('globalHour'), breakerMinRight: num('breakerMinRight'), breakerAfter: num('breakerAfter'),
    perShopDay: { launch: num('launch'), growth: num('growth'), scale: num('scale') },
  }
  const reason = Reason.safeParse(form.get('reason'))
  if (!reason.success) return { fields: { reason: 'Say why, in a few words.' } }
  const signIn = form.get('signIn') === 'on'
  try { await ekSetLimits(staff, signIn, limits, reason.data) }
  catch { return { error: `A limit is outside its bounds (tries ${LIMIT_BOUNDS.triesPerCode.join('–')}, codes per number ${LIMIT_BOUNDS.perNumber10m.join('–')}).` } }
  return { ok: 'Limits saved.' }
}

export async function blockAction(form: FormData): Promise<ActionResult> {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return { error: staff.message }
  const p = z.object({ phone: z.string().max(20), lift: z.enum(['0', '1']), reason: Reason }).safeParse(Object.fromEntries(form))
  if (!p.success) return { error: 'A 10-digit number and a reason.' }
  const ok = await ekBlockNumber(staff, p.data.phone, p.data.lift === '1', p.data.reason).catch(() => false)
  return ok ? { ok: p.data.lift === '1' ? 'Number unblocked.' : 'Number blocked.' } : { fields: { phone: 'A 10-digit mobile number.' } }
}
