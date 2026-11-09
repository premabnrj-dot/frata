'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { ADMIN_ONLY, requireStaff } from '@/lib/auth/require-staff'
import { ekBlockNumber, ekSetLimits, ekSettings, ekShopControl } from '@/lib/admin/ekcode'
import { LIMIT_BOUNDS } from '@/domains/ekcode-core/limits'

const back = (tab: string, k: 'ok' | 'error', m: string) => `/admin/ekcode?tab=${tab}&${k}=${encodeURIComponent(m)}`
const Reason = z.string().trim().min(3).max(500)

export async function shopControlAction(form: FormData) {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) redirect('/admin')
  const p = z.object({ tenantId: z.string().uuid(), action: z.enum(['pause', 'resume', 'raise', 'reset']), value: z.coerce.number().int().optional(), reason: Reason, shop: z.string().max(80) })
    .safeParse(Object.fromEntries(form))
  if (!p.success) redirect(back('shops', 'error', 'Say why, in a few words.'))
  try { await ekShopControl(staff, p.data.tenantId, p.data.action, p.data.value ?? null, p.data.reason) }
  catch { redirect(back('shops', 'error', 'That was refused. A raised cap is 20 to 20,000 a day.')) }
  const done = { pause: 'paused', resume: 'running again', raise: 'cap raised', reset: 'breaker reset' }[p.data.action]
  redirect(back('shops', 'ok', `EkCode ${done} for ${p.data.shop}.`))
}

export async function limitsAction(form: FormData) {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) redirect('/admin')
  const num = (k: string) => Number(form.get(k))
  const limits = {
    perNumber10m: num('perNumber10m'), perNumberDay: num('perNumberDay'), triesPerCode: num('triesPerCode'), perNetworkHour: num('perNetworkHour'),
    perWideNetworkHour: num('perWideNetworkHour'), globalHour: num('globalHour'), breakerMinRight: num('breakerMinRight'), breakerAfter: num('breakerAfter'),
    perShopDay: { launch: num('launch'), growth: num('growth'), scale: num('scale') },
  }
  const reason = Reason.safeParse(form.get('reason'))
  if (!reason.success) redirect(back('controls', 'error', 'Say why, in a few words.'))
  const signIn = form.get('signIn') === 'on'
  try { await ekSetLimits(staff, signIn, limits, reason.data) }
  catch { redirect(back('controls', 'error', `A limit is outside its bounds (tries ${LIMIT_BOUNDS.triesPerCode.join('–')}, codes per number ${LIMIT_BOUNDS.perNumber10m.join('–')}).`)) }
  void ekSettings
  redirect(back('controls', 'ok', 'Limits saved.'))
}

export async function blockAction(form: FormData) {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) redirect('/admin')
  const p = z.object({ phone: z.string().max(20), lift: z.enum(['0', '1']), reason: Reason }).safeParse(Object.fromEntries(form))
  if (!p.success) redirect(back('controls', 'error', 'A 10-digit number and a reason.'))
  const ok = await ekBlockNumber(staff, p.data.phone, p.data.lift === '1', p.data.reason).catch(() => false)
  redirect(ok ? back('controls', 'ok', p.data.lift === '1' ? 'Number unblocked.' : 'Number blocked.') : back('controls', 'error', 'A 10-digit mobile number.'))
}
