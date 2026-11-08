'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { resumeOffer, stopOffer } from '@/lib/admin/offers'
import { ADMIN_ONLY, requireStaff } from '@/lib/auth/require-staff'
import { refreshShop } from '@/lib/queries/storefront'

// Admin › Offers (offers O·4): the kill switch. Admin role only (support staff see, never stop); every write audited in
// the library, in its own transaction; then the shop's cached pages are refreshed so shoppers stop seeing it.
const T = z.object({ tenantId: z.uuid(), id: z.uuid() })
const page = (t: string, kind: 'ok' | 'error', m: string) => `/admin/offers/${t}?${kind}=${encodeURIComponent(m)}`

async function admin() { const s = await requireStaff(ADMIN_ONLY); if (!s.ok) redirect('/admin/offers'); return s }

export async function stopAction(form: FormData) {
  const staff = await admin()
  const p = T.extend({ reason: z.string().trim().min(3).max(300) }).safeParse(Object.fromEntries(form))
  if (!p.success) redirect('/admin/offers')
  const ok = await stopOffer(staff, p.data.tenantId, p.data.id, p.data.reason)
  if (ok) refreshShop(p.data.tenantId, 'shop')
  redirect(page(p.data.tenantId, ok ? 'ok' : 'error', ok ? 'Stopped. Shoppers no longer get it; the shop sees your reason.' : 'That offer has ended or is already stopped.'))
}

export async function resumeAction(form: FormData) {
  const staff = await admin()
  const p = T.safeParse(Object.fromEntries(form))
  if (!p.success) redirect('/admin/offers')
  const r = await resumeOffer(staff, p.data.tenantId, p.data.id)
  if (r === 'resumed') refreshShop(p.data.tenantId, 'shop')
  redirect(page(p.data.tenantId, r === 'resumed' ? 'ok' : 'error', r === 'resumed' ? 'Resumed. It runs again as the shop set it.' : r === 'full' ? 'The shop already runs as many offers as it may. It must end one first.' : 'That offer is not stopped, or has ended.'))
}
