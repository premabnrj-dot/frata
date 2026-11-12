'use server'

import { z } from 'zod'
import { resumeOffer, stopOffer } from '@/lib/admin/offers'
import { ADMIN_ONLY, requireStaff } from '@/lib/auth/require-staff'
import { refreshShop } from '@/lib/queries/storefront'
import type { ActionResult } from '@/components/ui/action-form'

// Admin › Offers (offers O·4): the kill switch. Admin role only (support staff see, never stop); every write audited in
// the library, in its own transaction; then the shop's cached pages are refreshed so shoppers stop seeing it.
const T = z.object({ tenantId: z.uuid(), id: z.uuid() })
const BAD_FORM = 'That form was incomplete. Nothing was changed.'

export async function stopAction(form: FormData): Promise<ActionResult> {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return { error: staff.message }
  const p = T.extend({ reason: z.string().trim().min(3).max(300) }).safeParse(Object.fromEntries(form))
  if (!p.success) return T.safeParse(Object.fromEntries(form)).success ? { fields: { reason: 'Say why, in a few words.' } } : { error: BAD_FORM }
  const ok = await stopOffer(staff, p.data.tenantId, p.data.id, p.data.reason)
  if (ok) refreshShop(p.data.tenantId, 'shop')
  return ok ? { ok: 'Stopped. Shoppers no longer get it; the shop sees your reason.' } : { error: 'That offer has ended or is already stopped.' }
}

export async function resumeAction(form: FormData): Promise<ActionResult> {
  const staff = await requireStaff(ADMIN_ONLY)
  if (!staff.ok) return { error: staff.message }
  const p = T.safeParse(Object.fromEntries(form))
  if (!p.success) return { error: BAD_FORM }
  const r = await resumeOffer(staff, p.data.tenantId, p.data.id)
  if (r === 'resumed') refreshShop(p.data.tenantId, 'shop')
  return r === 'resumed' ? { ok: 'Resumed. It runs again as the shop set it.' } : { error: r === 'full' ? 'The shop already runs as many offers as it may. It must end one first.' : 'That offer is not stopped, or has ended.' }
}
